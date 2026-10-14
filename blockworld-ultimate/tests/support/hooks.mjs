// node --import ./tests/support/hooks.mjs … : permite importar módulos del juego que usan three.js.
import { register } from 'node:module';
register('./three-resolve.mjs', import.meta.url);
