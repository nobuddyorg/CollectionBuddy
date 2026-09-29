export function appRoot() {
  return document.getElementById('app-root') as HTMLElement;
}

export function mountAppRoot() {
  const root = document.createElement('div');
  root.id = 'app-root';
  document.body.appendChild(root);
}

export function removeAppRoot() {
  appRoot()?.remove();
}
