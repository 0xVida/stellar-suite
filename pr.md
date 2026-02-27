# PR: Community + Use Cases Pages, Loading States, and UI Polish

## Overview
This PR completes the remaining UX items for the Stellar Suite marketing site. It adds new Community and Use Cases pages, introduces lightweight loading states, and improves navigation with a top route loader and a scroll-to-top affordance. The changes are intentionally small and straightforward.

## What’s Included
- **Community page** with contributor highlights, stats, and contribution paths.
- **Use cases & examples page** showcasing common workflows and template-driven examples.
- **Top route loader** for visible feedback on navigation.
- **Scroll-to-top button** on the home page for long-scroll UX.
- **Skeleton loaders** for app-level and key routes (home, blog index, blog post, FAQ, community, use cases).
- **Navigation updates** to surface the new pages.

## Implementation Notes
- Kept components minimal and direct.
- Loading UI uses the existing `Skeleton` component.
- Route loader responds to `usePathname` changes and stays lightweight.
- Scroll-to-top is only mounted on the home page.

## Files Touched (High-Level)
- New pages: `frontend/src/app/community/page.tsx`, `frontend/src/app/use-cases/page.tsx`
- New loading states: `frontend/src/app/**/loading.tsx`
- New UI components: `frontend/src/components/RouteTopLoader.tsx`, `frontend/src/components/ScrollToTopButton.tsx`
- Navigation: `frontend/src/components/Navbar.tsx`
- Layout/home updates: `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`

## Issues Closed
- Closes #269
- Closes #268
- Closes #266
- Closes #263
- Closes #259

## Testing
- Not run (UI-only changes).

## Notes for Reviewers
- Copy and layout are easy to adjust if you want different emphasis.
