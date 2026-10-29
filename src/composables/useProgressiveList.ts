import { computed, onScopeDispose, ref, shallowRef, watch, type ComputedRef, type ShallowRef } from 'vue'

/** Số dòng vẽ mỗi đợt — đủ phủ khung 600 px nhiều lần. */
export const PROGRESSIVE_PAGE = 60

/**
 * P3: vẽ dần danh sách dài — `page` dòng đầu; phần tử canh (`sentinel`, đặt cuối danh sách) lọt vào khung cuộn
 * thì vẽ thêm một đợt. Vẽ 600 dòng một lúc mất ~3 s; người dùng chỉ thấy ~12 dòng.
 *
 * - `resetKey` đổi (thư mục / ô tìm / thẻ lọc) → về đợt đầu.
 * - `mustShowIndex` ≥ phần đã vẽ (vd ghi chú đang chọn) → vẽ tới đợt chứa nó.
 */
export function useProgressiveList<T>(
  items: () => readonly T[],
  options: {
    resetKey: () => unknown
    mustShowIndex?: () => number
    page?: number
  },
): {
  visible: ComputedRef<readonly T[]>
  hasMore: ComputedRef<boolean>
  sentinel: ShallowRef<HTMLElement | null>
  showMore: () => void
} {
  const page = options.page ?? PROGRESSIVE_PAGE
  const limit = ref(page)
  const visible = computed(() => {
    const all = items()
    return all.length <= limit.value ? all : all.slice(0, limit.value)
  })
  const hasMore = computed(() => items().length > limit.value)
  /** shallowRef: phần tử DOM giữ nguyên (không bọc proxy) để đưa thẳng cho IntersectionObserver. */
  const sentinel = shallowRef<HTMLElement | null>(null)

  function showMore(): void {
    if (hasMore.value) limit.value += page
  }

  watch(options.resetKey, () => {
    limit.value = page
  })

  const mustShowIndex = options.mustShowIndex
  if (mustShowIndex) {
    watch(
      mustShowIndex,
      (i) => {
        if (i >= limit.value) limit.value = (Math.floor(i / page) + 1) * page
      },
      { immediate: true },
    )
  }

  let observer: IntersectionObserver | null = null
  function observe(el: HTMLElement | null): void {
    observer?.disconnect()
    observer = null
    if (!el) return
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) showMore()
      },
      { root: el.parentElement, rootMargin: '0px 0px 240px 0px' },
    )
    observer.observe(el)
  }
  watch(sentinel, observe, { flush: 'post' })
  // Vẽ thêm xong mà sentinel vẫn trong khung (danh sách ngắn / khung cao) → quan sát lại để nạp tiếp.
  watch(limit, () => {
    const el = sentinel.value
    if (observer && el) {
      observer.unobserve(el)
      observer.observe(el)
    }
  }, { flush: 'post' })
  onScopeDispose(() => {
    observer?.disconnect()
    observer = null
  })

  return { visible, hasMore, sentinel, showMore }
}
