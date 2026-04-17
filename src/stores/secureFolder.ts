import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { foldersService } from '@/services/folders.service'
import { noteBodiesService } from '@/services/noteBodies.service'
import { notesService } from '@/services/notes.service'
import { useFoldersStore } from '@/stores/folders'
import { useNotesStore } from '@/stores/notes'
import {
  DEFAULT_PBKDF2_ITERATIONS,
  SECURE_VERIFIER_PLAINTEXT,
  decryptField,
  deriveKeyFromPassword,
  encryptField,
  generateSalt16,
  isEncryptedEnvelope,
  saltFromBase64,
  saltToBase64,
} from '@/utils/secureCrypto'

/**
 * CryptoKey chỉ trong RAM (Pinia); không ghi storage.
 * Đóng popup extension → mất key → phải nhập passphrase lại.
 */
export const useSecureFolderStore = defineStore('secureFolder', () => {
  const sessionKeys = shallowRef<Map<string, CryptoKey>>(new Map())

  function getKey(folderId: string): CryptoKey | null {
    return sessionKeys.value.get(folderId) ?? null
  }

  function setKey(folderId: string, key: CryptoKey): void {
    const next = new Map(sessionKeys.value)
    next.set(folderId, key)
    sessionKeys.value = next
  }

  function deleteKey(folderId: string): void {
    if (!sessionKeys.value.has(folderId)) return
    const next = new Map(sessionKeys.value)
    next.delete(folderId)
    sessionKeys.value = next
  }

  function isFolderLocked(folderId: string): boolean {
    const folders = useFoldersStore()
    const f = folders.folders.find((x) => x.id === folderId)
    if (!f?.is_secure) return false
    return !sessionKeys.value.has(folderId)
  }

  async function verifyPassphrase(
    folderId: string,
    password: string,
  ): Promise<void> {
    const folders = useFoldersStore()
    const folder = folders.folders.find((x) => x.id === folderId)
    if (!folder?.is_secure || !folder.secure_salt) {
      throw new Error('Folder is not secure')
    }
    const salt = saltFromBase64(folder.secure_salt)
    if (salt.length !== 16) throw new Error('Invalid salt')
    const key = await deriveKeyFromPassword(
      password,
      salt,
      folder.pbkdf2_iterations,
    )
    const notes = useNotesStore()
    const list = notes.notes.filter((n) => n.folder_id === folderId)
    try {
      if (folder.secure_verifier_enc) {
        const plain = await decryptField(folder.secure_verifier_enc, key)
        if (plain !== SECURE_VERIFIER_PLAINTEXT) {
          throw new Error('Wrong passphrase')
        }
      } else if (list.length === 0) {
        setKey(folderId, key)
        return
      } else {
        await decryptField(list[0].title, key)
        const firstBodies = notes.bodiesForNote(list[0].id)
        const firstBody = firstBodies[0]
        if (firstBody) {
          await decryptField(firstBody.label, key)
          await decryptField(firstBody.content, key)
        }
      }
    } catch {
      throw new Error('Wrong passphrase')
    }
    setKey(folderId, key)
  }

  async function refreshDecryptedNotesAfterLoad(): Promise<void> {
    if (sessionKeys.value.size === 0) return
    const notes = useNotesStore()
    const folders = useFoldersStore()
    for (const [folderId, key] of sessionKeys.value) {
      const folder = folders.folders.find((f) => f.id === folderId)
      if (!folder?.is_secure) continue
      for (let i = 0; i < notes.notes.length; i++) {
        const n = notes.notes[i]
        if (n.folder_id !== folderId) continue
        if (!isEncryptedEnvelope(n.title)) {
          continue
        }
        const title = await decryptField(n.title, key)
        notes.notes[i] = { ...n, title }
      }
      for (let j = 0; j < notes.bodies.length; j++) {
        const b = notes.bodies[j]
        const note = notes.notes.find((x) => x.id === b.note_id)
        if (note?.folder_id !== folderId) continue
        if (
          !isEncryptedEnvelope(b.label) ||
          !isEncryptedEnvelope(b.content)
        ) {
          continue
        }
        const label = await decryptField(b.label, key)
        const content = await decryptField(b.content, key)
        notes.bodies[j] = { ...b, label, content }
      }
    }
    await notes.persistCache()
  }

  async function unlockFolder(folderId: string, password: string): Promise<void> {
    await verifyPassphrase(folderId, password)
    const notes = useNotesStore()
    await notes.loadAll()
  }

  async function lockFolder(folderId: string): Promise<void> {
    deleteKey(folderId)
    const notes = useNotesStore()
    await notes.loadAll()
  }

  function lockAll(): void {
    sessionKeys.value = new Map()
  }

  async function enableSecureFolder(
    folderId: string,
    password: string,
    confirmPassword: string,
  ): Promise<void> {
    if (password.length < 8) {
      throw new Error('Passphrase must be at least 8 characters')
    }
    if (password !== confirmPassword) {
      throw new Error('Passphrases do not match')
    }
    const folders = useFoldersStore()
    const folder = folders.folders.find((x) => x.id === folderId)
    if (!folder) throw new Error('Folder not found')
    if (folder.is_secure) throw new Error('Folder is already secure')

    const salt = generateSalt16()
    const saltB64 = saltToBase64(salt)
    const iterations = DEFAULT_PBKDF2_ITERATIONS
    const key = await deriveKeyFromPassword(password, salt, iterations)

    const notes = useNotesStore()
    const list = notes.notes.filter((n) => n.folder_id === folderId)
    for (const n of list) {
      let title = n.title
      if (isEncryptedEnvelope(title)) {
        throw new Error('Note already encrypted')
      }
      title = await encryptField(title, key)
      await notesService.update(n.id, { title })
      const bs = notes.bodiesForNote(n.id)
      for (const b of bs) {
        if (isEncryptedEnvelope(b.label) || isEncryptedEnvelope(b.content)) {
          throw new Error('Note already encrypted')
        }
        const label = await encryptField(b.label, key)
        const content = await encryptField(b.content, key)
        await noteBodiesService.update(b.id, { label, content })
      }
    }

    const verifier = await encryptField(SECURE_VERIFIER_PLAINTEXT, key)
    const updated = await foldersService.update(folderId, {
      is_secure: true,
      secure_salt: saltB64,
      pbkdf2_iterations: iterations,
      secure_verifier_enc: verifier,
    })
    const idx = folders.folders.findIndex((f) => f.id === folderId)
    if (idx !== -1) folders.folders[idx] = updated
    folders.reorderFoldersByUpdated()
    await folders.persistCache()

    setKey(folderId, key)
    await notes.loadAll()
  }

  async function changePassphrase(
    folderId: string,
    oldPassword: string,
    newPassword: string,
    confirmNew: string,
  ): Promise<void> {
    if (newPassword.length < 8) {
      throw new Error('New passphrase must be at least 8 characters')
    }
    if (newPassword !== confirmNew) {
      throw new Error('New passphrases do not match')
    }
    const folders = useFoldersStore()
    const folder = folders.folders.find((x) => x.id === folderId)
    if (!folder?.is_secure || !folder.secure_salt) {
      throw new Error('Folder is not secure')
    }

    const oldSalt = saltFromBase64(folder.secure_salt)
    if (oldSalt.length !== 16) throw new Error('Invalid salt')
    const oldKey = await deriveKeyFromPassword(
      oldPassword,
      oldSalt,
      folder.pbkdf2_iterations,
    )

    const notes = useNotesStore()
    const list = notes.notes.filter((n) => n.folder_id === folderId)
    if (list.length === 0) {
      if (folder.secure_verifier_enc) {
        try {
          await decryptField(folder.secure_verifier_enc, oldKey)
        } catch {
          throw new Error('Current passphrase is wrong')
        }
      }
      const newSalt = generateSalt16()
      const newSaltB64 = saltToBase64(newSalt)
      const newKey = await deriveKeyFromPassword(
        newPassword,
        newSalt,
        DEFAULT_PBKDF2_ITERATIONS,
      )
      const verifier = await encryptField(SECURE_VERIFIER_PLAINTEXT, newKey)
      const updated = await foldersService.update(folderId, {
        secure_salt: newSaltB64,
        pbkdf2_iterations: DEFAULT_PBKDF2_ITERATIONS,
        secure_verifier_enc: verifier,
      })
      const idx = folders.folders.findIndex((f) => f.id === folderId)
      if (idx !== -1) folders.folders[idx] = updated
      folders.reorderFoldersByUpdated()
      await folders.persistCache()
      deleteKey(folderId)
      setKey(folderId, newKey)
      return
    }

    const first = list[0]
    const firstBodies = notes.bodiesForNote(first.id)
    try {
      await decryptField(first.title, oldKey)
      const fb = firstBodies[0]
      if (fb) {
        await decryptField(fb.label, oldKey)
        await decryptField(fb.content, oldKey)
      }
    } catch {
      throw new Error('Current passphrase is wrong')
    }

    const newSalt = generateSalt16()
    const newSaltB64 = saltToBase64(newSalt)
    const newKey = await deriveKeyFromPassword(
      newPassword,
      newSalt,
      DEFAULT_PBKDF2_ITERATIONS,
    )

    for (const n of list) {
      const titlePlain = await decryptField(n.title, oldKey)
      const title = await encryptField(titlePlain, newKey)
      await notesService.update(n.id, { title })
      const bs = notes.bodiesForNote(n.id)
      for (const b of bs) {
        const labelPlain = await decryptField(b.label, oldKey)
        const contentPlain = await decryptField(b.content, oldKey)
        const label = await encryptField(labelPlain, newKey)
        const content = await encryptField(contentPlain, newKey)
        await noteBodiesService.update(b.id, { label, content })
      }
    }

    const verifier = await encryptField(SECURE_VERIFIER_PLAINTEXT, newKey)
    const updatedFolder = await foldersService.update(folderId, {
      secure_salt: newSaltB64,
      pbkdf2_iterations: DEFAULT_PBKDF2_ITERATIONS,
      secure_verifier_enc: verifier,
    })
    const fIdx = folders.folders.findIndex((f) => f.id === folderId)
    if (fIdx !== -1) folders.folders[fIdx] = updatedFolder
    folders.reorderFoldersByUpdated()
    await folders.persistCache()

    deleteKey(folderId)
    setKey(folderId, newKey)
    await notes.loadAll()
  }

  return {
    sessionKeys,
    getKey,
    isFolderLocked,
    unlockFolder,
    lockFolder,
    lockAll,
    enableSecureFolder,
    changePassphrase,
    refreshDecryptedNotesAfterLoad,
  }
})
