export type Language = 'de' | 'en';
export type TranslationValue = string | { [key: string]: TranslationValue };
export type Translations = Record<Language, TranslationValue>;
