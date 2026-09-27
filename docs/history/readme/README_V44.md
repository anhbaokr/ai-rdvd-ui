# AI RDvD UI V44 — TOPBAR MENU INTERACTION FIX

V44 restores the Language and Theme menus while retaining the V43 shrink-safe
Timeline layout.

## Root cause

The menu position was calculated in viewport coordinates with
`getBoundingClientRect()`, but the dropdown remained absolutely positioned
inside its top-bar wrapper. The viewport offset was therefore applied again,
placing the dropdown outside the visible window.

## Fix

- Floating top-bar dropdowns now use `position: fixed`, matching their viewport
  coordinates.
- `right: auto` prevents the older anchored-dropdown rule from conflicting with
  the calculated left position.
- A top-level z-index and explicit pointer events keep both menus visible and
  clickable above the editor layers.

Language/theme state, persistence, keyboard shortcuts and the V43 Timeline fix
remain unchanged.
