export interface AddressDisplayState {
  value: string;
  dirty: boolean;
}

export function resolveAddressDisplay(
  currentValue: string,
  nextUrl: string,
  focused: boolean,
  dirty: boolean
): AddressDisplayState {
  if (focused && dirty) {
    return { value: currentValue, dirty: true };
  }
  return { value: nextUrl, dirty: false };
}
