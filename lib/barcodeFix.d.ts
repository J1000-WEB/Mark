// 타입 선언 전용 (실제 로직은 barcodeFix.js). ERP 에이전트와 대시보드 앱이 같은 barcodeFix.js를
// 쓰기 위해 이 파일은 순수 CommonJS(.js)로 남겨두고, 대시보드 앱(TypeScript)에서 import할 때
// 타입이 붙도록 이 선언 파일만 옆에 둡니다.

export type ColorNameToCodeEntry = { name: string; code: string };
export type FixResult = { fixed: string; changed: boolean; matchedName?: string };

export const DEFAULT_COLOR_CODES: Set<string>;
export const DEFAULT_SIZE_CODES: string[];
export const DEFAULT_COLOR_NAME_TO_CODE: ColorNameToCodeEntry[];

export function fixFullColorNameToCode(barcode: string, nameToCodeList?: ColorNameToCodeEntry[]): FixResult;
export function fixOldStyleSizeColorOrder(barcode: string, colorCodes?: Set<string>, sizeCodes?: string[]): FixResult;
export function needsBarcodeValidation(barcode: string): boolean;
export function isKnownBarcode(barcode: string, masterSet?: Set<string>): boolean;
