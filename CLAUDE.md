# Fennec Bio Frontend

## Tech Stack

- **Framework**: Next.js 16 (App Router, React Server Components)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 (`@tailwindcss/postcss`)
- **UI Components**: shadcn/ui (New York style, slate base color)
- **Icons**: lucide-react
- **Fonts**: Geist (via `next/font/google`)

## Styling Conventions

### Class Merging

Use the `cn()` utility from `@/lib/utils` for all conditional/merged class names:

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Color System

Define colors as CSS custom properties in `globals.css` using **OKLch color space**. All components reference semantic tokens, never raw color values.

**Semantic tokens**: `--background`, `--foreground`, `--primary`, `--secondary`, `--destructive`, `--accent`, `--muted`, `--card`, `--popover`, `--border`, `--input`, `--ring`, `--chart-1` through `--chart-5`, and sidebar variants.

**Border radius scale** (base `--radius: 0.625rem`):
- `--radius-sm`: `calc(var(--radius) - 4px)`
- `--radius-md`: `calc(var(--radius) - 2px)`
- `--radius-lg`: `var(--radius)`
- `--radius-xl`: `calc(var(--radius) + 4px)`

### Dark Mode

- Applied via `.dark` class on a parent element (not system detection)
- Custom variant: `@custom-variant dark (&:is(.dark *))`
- All semantic color tokens must have both light and dark definitions

### Component Patterns

**Use shadcn/ui components** with class-variance-authority (CVA) for variants. Components live in `src/components/ui/` and use `data-slot` attributes for identification.

**Button variants**: default, destructive, outline, secondary, ghost, link
**Button sizes**: default, sm, lg, icon

**Card compound components**: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction

### Typography

- **Font**: Geist, applied via CSS variable `--font-geist` on `<body>`
- **Rendering**: `antialiased` on body
- **Weights**: `font-medium`, `font-semibold`, `font-bold`
- **Sizes**: standard Tailwind scale (`text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`)

### Spacing

- **Gaps**: `gap-2`, `gap-3`, `gap-4`, `gap-6`
- **Padding**: `p-2`, `p-3`, `p-4`, `p-6`
- **Mobile padding**: `px-3 py-3`
- **Desktop padding**: `md:px-4 md:py-4`, `lg:px-6`

### Layout

- **Mobile-first** responsive design
- **Breakpoints**: default (mobile), `md:` (tablet/desktop), `lg:` (large)
- **Max container width**: `max-w-[1920px] mx-auto`
- **Grid layouts**: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- **Fixed sidebar width**: `w-[364px]` when applicable
- **Mobile drawers**: `fixed inset-0 z-40 md:hidden` overlay pattern

### Interactive States

- **Focus**: `focus-visible:ring-ring/50 focus-visible:ring-[3px]` and `focus-visible:border-ring`
- **Hover buttons**: `hover:bg-primary/90`
- **Hover links**: `hover:text-blue-600 hover:underline`
- **Hover cards**: `hover:shadow-md transition-shadow`
- **Disabled**: `disabled:pointer-events-none disabled:opacity-50`
- **Loading**: `animate-pulse` with `bg-gray-200 rounded` skeletons

### Status Colors

- **Success**: `bg-green-50 text-green-600`
- **Error**: `bg-red-50 text-red-600`
- **Info/Selection**: `bg-blue-100 border-blue-300`

### Separators & Dividers

- **Section dividers**: `border-b border-gray-200` (light grey, used in dropdowns, tabs, card sections)
- **Row separators in tables**: `border-b border-gray-200` or `divide-y divide-gray-200`
- **Dropdown section dividers** (e.g., "Currently Selected" separator): `border-b border-gray-200`

### Tags & Badges

```
inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800
```

### Forms

- **Labels**: `block text-sm font-medium text-gray-700 mb-1`
- **Inputs**: `border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`
- **Error messages**: `text-red-600 bg-red-50 p-2 rounded`

### Tables

- **Container**: `overflow-x-auto` for responsive scroll
- **Row separators**: `border-b border-gray-200`
- **Headers**: `text-left text-gray-500 font-medium pb-2`
- **Sticky columns**: `sticky left-0 bg-inherit`

### Collapsible Sections

```tsx
<div className="bg-white rounded-lg shadow">
  <button className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-t-lg">
    <span>{title}</span>
    {isOpen ? <ChevronDown /> : <ChevronRight />}
  </button>
  {isOpen && <div>{children}</div>}
</div>
```

## Required Dependencies

When setting up, install these styling dependencies:

```bash
npm install clsx tailwind-merge class-variance-authority lucide-react @radix-ui/react-slot
```

## shadcn/ui Configuration

`components.json` should use:
- **Style**: new-york
- **Base color**: slate
- **CSS variables**: enabled
- **Icon library**: lucide
- **Aliases**: `@/components`, `@/components/ui`, `@/lib`, `@/hooks`
