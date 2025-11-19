# @databuddy/tracker

Lightweight, high-performance analytics tracker for Databuddy.

## Installation

### Standard Loading (Recommended)

Add this script to your `<head>` or `<body>`:

```html
<script 
  defer 
  src="https://your-cdn.com/databuddy.js" 
  data-client-id="YOUR_CLIENT_ID"
></script>
```

### Specialized Scripts

If you only want to track specific metrics, you can use our specialized lightweight scripts.

#### Web Vitals Only (~1KB)

```html
<script 
  defer 
  src="https://your-cdn.com/vitals.js" 
  data-client-id="YOUR_CLIENT_ID"
></script>
```

#### Error Tracking Only (~1KB)

```html
<script 
  defer 
  src="https://your-cdn.com/errors.js" 
  data-client-id="YOUR_CLIENT_ID"
></script>
```

## Development

- `bun install`: Install dependencies
- `bun run build`: Build the tracker scripts
- `bun run dev`: Build in watch mode

