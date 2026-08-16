---
name: Warm Professionalism
colors:
  surface: '#fff8f6'
  surface-dim: '#eed5cc'
  surface-bright: '#fff8f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff1ec'
  surface-container: '#ffe9e2'
  surface-container-high: '#fde3da'
  surface-container-highest: '#f7ddd4'
  on-surface: '#261813'
  on-surface-variant: '#594138'
  inverse-surface: '#3c2d27'
  inverse-on-surface: '#ffede7'
  outline: '#8d7166'
  outline-variant: '#e1bfb3'
  surface-tint: '#a63b00'
  primary: '#a63b00'
  on-primary: '#ffffff'
  primary-container: '#f26522'
  on-primary-container: '#4f1800'
  inverse-primary: '#ffb599'
  secondary: '#006e24'
  on-secondary: '#ffffff'
  secondary-container: '#76fa84'
  on-secondary-container: '#007326'
  tertiary: '#006492'
  on-tertiary: '#ffffff'
  tertiary-container: '#009ade'
  on-tertiary-container: '#002d45'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb599'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#7f2b00'
  secondary-fixed: '#79fd86'
  secondary-fixed-dim: '#5ce06d'
  on-secondary-fixed: '#002106'
  on-secondary-fixed-variant: '#005319'
  tertiary-fixed: '#cae6ff'
  tertiary-fixed-dim: '#8cceff'
  on-tertiary-fixed: '#001e2f'
  on-tertiary-fixed-variant: '#004b6f'
  background: '#fff8f6'
  on-background: '#261813'
  surface-variant: '#f7ddd4'
typography:
  h1:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
    letterSpacing: -0.02em
  h2:
    fontFamily: Manrope
    fontSize: 22px
    fontWeight: '800'
    lineHeight: 28px
    letterSpacing: -0.01em
  h3:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '800'
    lineHeight: 24px
  h4:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 22px
  body:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 24px
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  margin-mobile: 20px
  gutter-mobile: 12px
---

## Brand & Style

The design system is built upon the pillars of warmth, reliability, and safety. It caters to a dual audience: concerned parents seeking the best for their children and professional CarePartners providing essential support. 

The visual style is a blend of **Corporate Modern** and **Soft Minimalism**. It avoids the clinical coldness of traditional enterprise software by utilizing a high-energy primary orange balanced with a grounded secondary green. The interface prioritizes clarity and approachability through generous whitespace, rounded geometry, and subtle, warm-tinted depth. The emotional response should be one of "supervised freedom"—a professional environment that feels safe and human.

## Colors

The color palette is strategically split between action and identity. 

- **Primary Orange (#F26522)**: Reserved for primary intent. It signifies energy and parent-led actions. Use the `highlight` tint for large background areas like empty states or section headers to maintain warmth without overwhelming the user.
- **Secondary Green (#2DB84B)**: Specifically identifies the "CarePartner" role. This creates a mental shortcut for parents; anything green is related to the professional caregiver’s status, profile, or verified credentials.
- **Surface Strategy**: The default background is a very soft grey (`#F7F7F7`), allowing white cards (`#FFFFFF`) to pop clearly. The `Alt Surface` (`#FFF9F5`) is strictly for promotional content or highlighted "Pro" features to differentiate from standard operational tasks.

## Typography

This design system employs a dual-font strategy to balance authority with friendliness.

**Manrope** is used for all headlines. Its geometric but slightly condensed nature feels modern and highly professional. For the top-tier levels (h1, h2), use tight tracking (letter-spacing) to create a "blocky" authoritative look that anchors the screen.

**Plus Jakarta Sans** is the workhorse for body text. Its open counters and soft curves make long-form reading (like caregiver bios or daily reports) effortless and inviting. 

**Hierarchy Rules:**
- Use **h1** only for main screen entries.
- Use **caption** in All-Caps for small labels above input fields or secondary metadata.
- All body text should maintain a 500 (Medium) weight to ensure readability against light backgrounds.

## Layout & Spacing

The layout follows a **Fluid Grid** model optimized for mobile-first interaction. 

- **Outer Margins**: Use a consistent 20px margin on the left and right edges of the screen to create a "contained" feel that improves focus.
- **Vertical Rhythm**: Use the 8px base unit. Most components should be separated by `md` (16px) or `lg` (24px) spacing.
- **Internal Padding**: Components like cards and list items should use a minimum of 16px internal padding to ensure touch targets remain comfortable and the content feels "airy."
- **Touch Targets**: No interactive element (links, buttons, icons) should have a hit area smaller than 44x44px.

## Elevation & Depth

Depth is used sparingly to indicate interactivity and hierarchy. Shadows are not neutral; they are infused with a hint of the brand’s primary orange to maintain the "warm" atmosphere even in the shadows.

- **Small Depth**: Used for subtle separation of search bars or small input groups.
- **Medium Depth**: The standard for interaction. Used for state changes when a user taps a card.
- **Large Depth (Shadow Orange)**: Reserved exclusively for Floating Action Buttons (FABs) and Primary Call-to-Action buttons. This "glow" effect draws immediate attention to the most important task on the screen.
- **Tonal Layers**: Use the primary `highlight` color (#FFF4ED) as a flat background for non-interactive content blocks that need to stand out from the white surface without using shadows.

## Shapes

The shape language is "Extra-Soft." High corner radii are used to evoke feelings of safety and child-friendliness while remaining professional.

- **Standard Cards**: Use the `lg` (20px) radius. This is the hallmark of the system.
- **Buttons & Inputs**: Use the `md` (14px) radius. It creates a distinct look from the cards while remaining soft.
- **Large Container Headers**: When a top-section background bleeds into the status bar, use the `xl` (28px) radius on the bottom corners to transition into the main content.
- **Avatars**: Always use `full` (circular) for CarePartner and child photos to emphasize the human element.

## Components

### Buttons
- **Primary**: Solid #F26522, White text, `lg` shadow. On press, transition to #D4541E.
- **Secondary (CarePartner)**: Solid #2DB84B, White text. Used for actions specifically related to caregiving tasks.
- **Ghost**: Transparent background, Primary color text, no border. Used for "Cancel" or "Skip" actions.

### Cards
- **Parent Card**: White background, 20px radius, subtle `sm` shadow.
- **CarePartner Profile Card**: Includes a Green (#2DB84B) "Verified" badge and uses the `CardHover` shadow when in a list view.

### Input Fields
- **Default State**: #F0F0F0 border, 14px radius, White background.
- **Active State**: 2px solid #F26522 border with a subtle orange glow.
- **Labels**: Use `caption` style in #6B7280, positioned 8px above the field.

### Chips
- **Status Chips**: Use #EAFBEF background with #1E9439 text for "Available" or "Confirmed."
- **Attribute Chips**: 999px radius, #F7F7F7 background, #1A1A2E text.

### Icons & Illustrations
- **Icons**: 2px stroke width, rounded caps and joins (Ionicons style). Inactive: #6B7280; Active: #F26522.
- **Illustrations**: Flat, minimal geometry. Use the "Safety Palette": Primary Orange for humans, Secondary Green for nature/growth elements, and Beige/Light Orange for backgrounds. Avoid sharp points in any character design.