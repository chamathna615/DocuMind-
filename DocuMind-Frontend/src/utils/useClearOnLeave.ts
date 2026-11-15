import { useEffect } from 'react'

/**
 * Makes sure generated content never outlives the page that shows it.
 *
 * - Leaving the page inside the app: the page unmounts, so its component state is dropped. The cached
 *   copies in React Query are dropped too, because the queries that load generated text use `gcTime: 0`
 *   (they are removed from the cache as soon as no page is showing them).
 * - Leaving the site and coming back with the browser's Back button: the browser may restore the old
 *   page from its back/forward cache, including the old text. A restored page is reloaded, so the
 *   content area starts empty again. The lecture itself stays in the Lecture History.
 */
export function useClearOnLeave() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])
}
