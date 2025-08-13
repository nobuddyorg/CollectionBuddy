export function initialsFromEmail(email: string) {
    const first = (email || "").slice(0, 1).toUpperCase();
    return first || "U";
}
