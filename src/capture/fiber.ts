interface ReactFiberLike {
  return?: ReactFiberLike | null;
  type?: unknown;
}

const MINIFIED_COMPONENT_NAME_LENGTH = 2;

function readDisplayName(type: unknown): string | null {
  if (typeof type !== "function") {
    return null;
  }

  const candidate =
    "displayName" in type && typeof type.displayName === "string" ? type.displayName : type.name;

  if (!candidate || candidate.length <= MINIFIED_COMPONENT_NAME_LENGTH) {
    return null;
  }

  return candidate;
}

function getDataComponent(el: Element): string | null {
  const candidate = el.closest<HTMLElement>("[data-component]")?.dataset.component ?? null;
  return candidate && candidate.trim().length > 0 ? candidate : null;
}

export function getComponentName(el: Element | null): string | null {
  if (!el) {
    return null;
  }

  try {
    const dataComponent = getDataComponent(el);
    const fiberKey = Object.keys(el).find(
      (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
    );

    if (!fiberKey) {
      return dataComponent;
    }

    let fiber = (el as unknown as Record<string, ReactFiberLike | undefined>)[fiberKey] ?? null;

    while (fiber) {
      const displayName = readDisplayName(fiber.type);
      if (displayName) {
        return displayName;
      }
      fiber = fiber.return ?? null;
    }

    return dataComponent;
  } catch {
    return null;
  }
}
