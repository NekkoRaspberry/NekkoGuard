/**
 * Navigation layout breakpoints (keep in sync with the CSS media queries that cite
 * this file: Sidebar, TopBar, AppShell).
 *
 * - ≥ 1024px  — the expanded sidebar (248px) still leaves ≥ 776px for the content:
 *   a 720px form (--form-max) plus page padding. The user's own choice applies
 *   (expanded, or collapsed to the rail).
 * - 640–1023px — expanded would squeeze the content, so the 64px icon rail is
 *   forced; the user's saved choice is kept and applies again on wider screens.
 *   (The top navigation also needs ≥ 1024px; below it the rail is used.)
 * - < 640px   — phones: even 64px is too much next to the top bar (context switcher
 *   and account menu), so the sidebar becomes the drawer behind the menu button.
 */
export const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';
export const RAIL_LAYOUT_QUERY = '(min-width: 640px)';
