interface ReactFiberLike {
  return?: ReactFiberLike | null;
  type?: unknown;
  elementType?: unknown;
  tag?: number;
}

interface ComponentTypeLike {
  displayName?: string;
  name?: string;
  render?: ComponentTypeLike;
  type?: ComponentTypeLike;
  _context?: { displayName?: string };
  _status?: number;
  _result?: ComponentTypeLike;
}

const FiberTags = {
  FunctionComponent: 0,
  ClassComponent: 1,
  IndeterminateComponent: 2,
  HostRoot: 3,
  HostPortal: 4,
  HostComponent: 5,
  HostText: 6,
  Fragment: 7,
  Mode: 8,
  ContextConsumer: 9,
  ContextProvider: 10,
  ForwardRef: 11,
  Profiler: 12,
  SuspenseComponent: 13,
  MemoComponent: 14,
  SimpleMemoComponent: 15,
  LazyComponent: 16
} as const;

const MAX_COMPONENTS = 6;
const MAX_DEPTH = 30;
const SKIP_EXACT = new Set([
  "Component",
  "ErrorBoundaryHandler",
  "Fragment",
  "Hot",
  "HotReload",
  "Outlet",
  "Profiler",
  "PureComponent",
  "Route",
  "Routes",
  "Root",
  "StrictMode",
  "Suspense"
]);
const SKIP_PATTERNS = [
  /Boundary$/,
  /BoundaryHandler$/,
  /Consumer$/,
  /^Client(Page|Root|Segment)/,
  /^Dev(Overlay|Tools|Root)/,
  /Handler$/,
  /^Hot(Reload)?$/,
  /^Inner/,
  /^LayoutSegment/,
  /Overlay$/,
  /Provider$/,
  /^React(Overlay|Tools|Root)/,
  /Router$/,
  /^RSC/,
  /^Segment(ViewNode|Node)$/,
  /^Server(Root|Component|Render)/,
  /^With[A-Z]/,
  /Wrapper$/
];

function isComponentType(value: unknown): value is ComponentTypeLike {
  return (typeof value === "function" || (typeof value === "object" && value !== null));
}

function isMinifiedName(name: string): boolean {
  if (name.length <= 2) {
    return true;
  }

  return name.length <= 3 && name === name.toLowerCase();
}

function isFrameworkInternal(name: string): boolean {
  return SKIP_EXACT.has(name) || SKIP_PATTERNS.some((pattern) => pattern.test(name));
}

function readDisplayName(type: unknown): string | null {
  if (!isComponentType(type)) {
    return null;
  }

  const candidate = type.displayName ?? type.name;

  if (!candidate || isMinifiedName(candidate) || isFrameworkInternal(candidate)) {
    return null;
  }

  return candidate;
}

function getDataComponent(el: Element): string | null {
  const candidate = el.closest<HTMLElement>("[data-component]")?.dataset.component ?? null;
  return candidate && candidate.trim().length > 0 ? candidate : null;
}

function getReactFiberKey(el: Element): string | null {
  return (
    Object.keys(el).find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
    ) ?? null
  );
}

function getComponentNameFromFiber(fiber: ReactFiberLike): string | null {
  const tag = fiber.tag;

  if (
    tag === FiberTags.HostRoot ||
    tag === FiberTags.HostPortal ||
    tag === FiberTags.HostComponent ||
    tag === FiberTags.HostText ||
    tag === FiberTags.Fragment ||
    tag === FiberTags.Mode ||
    tag === FiberTags.Profiler ||
    tag === FiberTags.SuspenseComponent
  ) {
    return null;
  }

  if (tag === FiberTags.ForwardRef) {
    const elementType = fiber.elementType as ComponentTypeLike | null;
    return readDisplayName(elementType?.render) ?? readDisplayName(elementType) ?? readDisplayName(fiber.type);
  }

  if (tag === FiberTags.MemoComponent || tag === FiberTags.SimpleMemoComponent) {
    const elementType = fiber.elementType as ComponentTypeLike | null;
    return readDisplayName(elementType?.type) ?? readDisplayName(elementType) ?? readDisplayName(fiber.type);
  }

  if (tag === FiberTags.ContextProvider) {
    const type = fiber.type as ComponentTypeLike | null;
    const name = type?._context?.displayName;
    return name && !isMinifiedName(name) ? `${name}.Provider` : null;
  }

  if (tag === FiberTags.ContextConsumer) {
    const name = readDisplayName(fiber.type);
    return name ? `${name}.Consumer` : null;
  }

  if (tag === FiberTags.LazyComponent) {
    const elementType = fiber.elementType as ComponentTypeLike | null;
    return elementType?._status === 1 ? readDisplayName(elementType._result) : null;
  }

  if (typeof fiber.type === "string") {
    return null;
  }

  return readDisplayName(fiber.type) ?? readDisplayName(fiber.elementType);
}

export function getComponentPath(el: Element | null): string[] | null {
  if (!el) {
    return null;
  }

  try {
    const dataComponent = getDataComponent(el);
    const fiberKey = getReactFiberKey(el);

    if (!fiberKey) {
      return dataComponent ? [dataComponent] : null;
    }

    let fiber = (el as unknown as Record<string, ReactFiberLike | undefined>)[fiberKey] ?? null;
    const components: string[] = [];
    let depth = 0;

    while (fiber && depth < MAX_DEPTH && components.length < MAX_COMPONENTS) {
      const componentName = getComponentNameFromFiber(fiber);
      if (componentName) {
        components.push(componentName);
      }

      fiber = fiber.return ?? null;
      depth++;
    }

    if (components.length === 0) {
      return dataComponent ? [dataComponent] : null;
    }

    return components.reverse();
  } catch {
    return null;
  }
}

export function getComponentName(el: Element | null): string | null {
  const dataComponent = el ? getDataComponent(el) : null;
  const path = getComponentPath(el);

  if (!path || path.length === 0) {
    return dataComponent;
  }

  return path[path.length - 1] ?? dataComponent;
}
