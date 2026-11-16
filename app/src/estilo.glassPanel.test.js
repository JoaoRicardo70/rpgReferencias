import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// `.glass-panel` é a classe das ABAS e tem display:none (só aparece com `.glass-panel.ativo`).
// Componente novo com `glass-panel` sem `ativo` fica INVISÍVEL (testes não carregam CSS). Este guarda varre os componentes.
const RAIZ = path.resolve(__dirname, 'components');

function listarJsx(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return listarJsx(p);
        return e.name.endsWith('.jsx') && !/\.test\.jsx$/.test(e.name) && e.name !== 'TabPanel.jsx' ? [p] : [];
    });
}

// Procura strings (aspas simples, duplas ou template) que contenham glass-panel sem a palavra `ativo`.
const TEXTOS = /'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g;

// Devolve os textos de `fonte` com glass-panel sem ativo.
function acharFalhas(fonte) {
    const achados = [];
    let m;
    TEXTOS.lastIndex = 0;
    while ((m = TEXTOS.exec(fonte))) {
        const texto = m[1] ?? m[2] ?? m[3] ?? '';
        if (/(^|[\s])glass-panel(?![\w-])/.test(texto) && !/(^|[\s])ativo(?![\w-])/.test(texto)) achados.push(texto);
    }
    return achados;
}

describe('guarda: o detector pega o erro (exemplo sintético)', () => {
    it('acusa glass-panel sem ativo em aspas simples, duplas e template', () => {
        expect(acharFalhas(`<div className='glass-panel x' />`)).toEqual(['glass-panel x']);
        expect(acharFalhas(`<div className="a glass-panel" />`)).toEqual(['a glass-panel']);
        expect(acharFalhas('<div className={`glass-panel ${y}`} />')).toEqual(['glass-panel ${y}']);
    });
    it('aceita glass-panel com ativo e nomes parecidos', () => {
        expect(acharFalhas(`<div className="glass-panel ativo" />`)).toEqual([]);
        expect(acharFalhas(`<div className="ativo glass-panel" />`)).toEqual([]);
        expect(acharFalhas(`<div className="glass-panel-x" />`)).toEqual([]);
        expect(acharFalhas(`<div className="meu-glass-panel" />`)).toEqual([]);
    });
});

describe('guarda: glass-panel sem ativo', () => {
    it('nenhum componente usa glass-panel sem "ativo" na mesma string de className', () => {
        const falhas = [];
        listarJsx(RAIZ).forEach((arq) => {
            acharFalhas(fs.readFileSync(arq, 'utf8')).forEach((texto) => falhas.push(`${path.relative(RAIZ, arq)}: "${texto.slice(0, 80)}"`));
        });
        expect(falhas).toEqual([]);
    });
});
