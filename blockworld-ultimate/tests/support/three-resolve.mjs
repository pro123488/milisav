// Gancho de resolución para las pruebas en Node: 'three' → la copia local de vendor/ (como el importmap del navegador).
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../../vendor/three.module.min.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
