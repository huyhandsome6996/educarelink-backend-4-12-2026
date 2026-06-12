# The Design System: Editorial Empathy

## 1. Overview & Creative North Star
**Creative North Star: The Nurturing Curator**

This design system is built to bridge the gap between high-end professional reliability and the warmth of human care. We move away from the "standard SaaS" look—characterized by rigid grids and heavy borders—and toward an **Editorial Empathy** aesthetic. 

The experience should feel like a high-end digital journal: sophisticated, spacious, and calm. We achieve this through **Organic Asymmetry** (varying card heights and intentional whitespace), **Tonal Layering** (replacing lines with color depth), and **Heroic Typography** (large, confident headings paired with intimate body text). By breaking the "template" look, we signal to families and caregivers that this platform is bespoke, thoughtful, and human-centric.

---

2. Colors & Surface Architecture

Our palette balances the authority of `primary` (#0051d5) with the warmth of `secondary` (#845400). 

### The "No-Line" Rule
To maintain a premium, seamless feel, **1px solid borders are strictly prohibited** for sectioning or containment. We define boundaries exclusively through background shifts:
- A `surface-container-low` section sitting on a `surface` background.
- Using `surface-container-highest` to draw focus to a sidebar without a hard edge.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of fine paper or frosted glass.
*   **Base:** `surface` (#f8f9fa)
*   **Sectioning:** `surface-container-low` (#f3f4f5) for large layout blocks.
*   **Elevated Content:** `surface-container-lowest` (#ffffff) for cards or interactive modules.
*   **Interaction/Focus:** `surface-container-high` (#e7e8e9) for hover states.

### The "Glass & Gradient" Rule
For hero sections or floating navigation, use **Glassmorphism**: 
- Background: `surface` at 70% opacity.
- Effect: `backdrop-blur` (12px–20px).
- **Signature Texture:** Use subtle radial gradients (e.g., `primary` transitioning to `primary-container`) for CTAs to give them "soul" and a tactile, pillowy depth.

---

## 3. Typography: The Editorial Voice

We utilize a dual-font strategy to balance modernity with readability.

*   **Display & Headlines (Manrope):** This is our "Authoritative" voice. Use `display-lg` for hero statements with tight letter-spacing (-0.02em) to create a high-end, editorial impact.
*   **Body & Titles (Plus Jakarta Sans):** This is our "Functional" voice. It is highly legible and friendly. Use `body-lg` for primary content to ensure the platform feels accessible to all age groups.

**Hierarchy as Identity:**
- **Confidence:** Large `headline-lg` values in `on-surface`.
- **Clarity:** `label-md` in `on-surface-variant` for metadata, ensuring a clear distinction between "content" and "instruction."

---

## 4. Elevation & Depth

We reject the "drop shadow" of 2010. Elevation in this system is achieved through light and tone.

*   **The Layering Principle:** Instead of shadows, stack `surface-container-lowest` on `surface-container-low`. The 1-2% contrast shift is enough for the human eye to perceive depth without visual clutter.
*   **Ambient Shadows:** If an element must float (e.g., a modal or floating action button), use a "Diffusion Shadow": `0 20px 40px rgba(0, 83, 219, 0.06)`. Note the use of a `primary` tint in the shadow—this mimics natural light refraction.
*   **The "Ghost Border" Fallback:** If accessibility requires a stroke, use `outline-variant` at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons: Tactile Warmth
- **Primary:** `primary` (#0051d5) background with `on-primary` text. Apply a subtle linear gradient from top-left. Shape: `rounded-xl`.
- **Secondary:** `secondary-fixed` (#ffddb6) with `on-secondary-fixed`. This provides a "warm glow" to secondary actions.
- **Interactions:** On hover, shift background to `primary-container`. On tap, scale down to 0.98.

### Input Fields: Clean Foundations
- **Canvas:** `surface-container-lowest` (#ffffff).
- **Border:** Ghost border (15% `outline-variant`).
- **Focus:** Transition to a 2px `primary` bottom-border only, keeping the sides soft and open.

### Cards & Lists: The Separation Principle
- **Forbid dividers.** To separate job listings or family profiles, use 24px–32px of vertical whitespace or a toggle between `surface` and `surface-container-low` background colors.
- **Leading Elements:** Icons (Lucide `ShieldCheck`, `HeartHandshake`) should be encased in a `secondary-container` soft-circle (radius: 50%) to highlight trust features.

### Specialty Component: The "Trust Badge"
A chip-like component using `tertiary-container` with `on-tertiary-container` text. Use for verified caregivers or background-checked status. It should feel "leafy" and calm.

---

## 6. Do's and Don'ts

### Do:
- **Do** use `rounded-xl` (1rem) for most cards and `rounded-2xl` (1.5rem) for large containers to emphasize "safety."
- **Do** lean into whitespace. If you think there’s enough space, add 8px more.
- **Do** use Lucide icons with a `stroke-width` of 1.5px to match the weight of `Plus Jakarta Sans`.

### Don't:
- **Don't** use pure black (#000000) for text. Always use `on-surface` (#191c1d) to keep the vibe sophisticated.
- **Don't** use standard "blue" for links. Use `primary` (#0051d5) with an animated underline (2px thickness).
- **Don't** crowd the interface. This platform helps families manage chaos; the UI should not contribute to it.

### Accessibility Note:
While we use tonal shifts, ensure that the contrast ratio between `surface-container` tiers and their content always meets WCAG AA standards. When in doubt, use `on-surface-variant` for secondary text to ensure legibility.