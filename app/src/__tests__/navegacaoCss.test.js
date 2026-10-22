import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../css/styles.css'), 'utf8');

describe('CSS dos modos de navegacao', () => {
    it.each(['orbe-botao', 'orbe-menu', 'hub-cartao', 'painel-combate', 'painel-gaveta', 'gaveta-cabecalho', 'sessao-botao-sair'])('define a classe .%s', (c) => {
        expect(css).toMatch(new RegExp(`\\.${c}(?![\\w-])`));
    });
    it('Combate em colunas fluidas com minmax(min(460px, 100%), 1fr)', () => {
        expect(css).toContain('minmax(min(460px, 100%), 1fr)');
    });
});
