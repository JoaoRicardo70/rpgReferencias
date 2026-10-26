import { describe, it, expect } from 'vitest';
import {
    ehImagemValida, tamanhoReduzido, listarMidia, podeApagarMidia, nomeDeNpcValido,
    montarFichaNpcDeImagem, descreverErroMidia, urlDeMidiaSegura, LIMITE_DATA_URL, ehDataUrlDeImagem, MENSAGEM_IMAGEM_INVALIDA, LIMITE_MIDIA, TAMANHO_MAX_ORIGINAL, LIMITE_NOME_NPC,
} from './midia';

describe('ehImagemValida', () => {
    it.each(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'IMAGE/PNG'])('aceita %s', (type) => {
        expect(ehImagemValida({ type, size: 1000 })).toBe(true);
    });
    it.each(['image/svg+xml', 'application/pdf', 'text/plain', 'video/mp4', '', 'image/png2'])('recusa tipo "%s"', (type) => {
        expect(ehImagemValida({ type, size: 1000 })).toBe(false);
    });
    it('limites de tamanho', () => {
        expect(ehImagemValida({ type: 'image/png', size: 1 })).toBe(true);
        expect(ehImagemValida({ type: 'image/png', size: TAMANHO_MAX_ORIGINAL })).toBe(true);
        expect(ehImagemValida({ type: 'image/png', size: TAMANHO_MAX_ORIGINAL + 1 })).toBe(false);
        expect(ehImagemValida({ type: 'image/png', size: 0 })).toBe(false);
        expect(ehImagemValida({ type: 'image/png', size: -5 })).toBe(false);
        expect(ehImagemValida({ type: 'image/png', size: 'abc' })).toBe(false);
        expect(ehImagemValida({ type: 'image/png' })).toBe(false);
    });
    it('entradas nulas ou malformadas', () => {
        expect(ehImagemValida(null)).toBe(false);
        expect(ehImagemValida(undefined)).toBe(false);
        expect(ehImagemValida({})).toBe(false);
        expect(ehImagemValida({ type: 5, size: 10 })).toBe(false);
    });
});

describe('tamanhoReduzido', () => {
    it('não amplia imagens pequenas', () => {
        expect(tamanhoReduzido(800, 600)).toEqual({ largura: 800, altura: 600 });
        expect(tamanhoReduzido(960, 960)).toEqual({ largura: 960, altura: 960 });
    });
    it('reduz mantendo a proporção (lado maior vira o limite)', () => {
        expect(tamanhoReduzido(1920, 960)).toEqual({ largura: 960, altura: 480 });
        expect(tamanhoReduzido(1000, 4000, 1000)).toEqual({ largura: 250, altura: 1000 });
    });
    it('nunca devolve lado menor que 1', () => {
        expect(tamanhoReduzido(10000, 1, 100)).toEqual({ largura: 100, altura: 1 });
    });
    it('zeros, negativos e inválidos devolvem 0x0', () => {
        expect(tamanhoReduzido(0, 100)).toEqual({ largura: 0, altura: 0 });
        expect(tamanhoReduzido(100, 0)).toEqual({ largura: 0, altura: 0 });
        expect(tamanhoReduzido(-1, 50)).toEqual({ largura: 0, altura: 0 });
        expect(tamanhoReduzido(undefined, undefined)).toEqual({ largura: 0, altura: 0 });
        expect(tamanhoReduzido('x', 'y')).toEqual({ largura: 0, altura: 0 });
    });
});

describe('listarMidia', () => {
    it('ordena do mais antigo ao mais novo e injeta o id', () => {
        const r = listarMidia({ b: { url: 'u2', ts: 20 }, a: { url: 'u1', ts: 10 }, c: { url: 'u3', ts: 30 } });
        expect(r.map(x => x.id)).toEqual(['a', 'b', 'c']);
        expect(r[0]).toEqual({ id: 'a', url: 'u1', ts: 10 });
    });
    it('mantém só as mais novas pelo limite', () => {
        const brutos = {};
        for (let i = 1; i <= 5; i++) brutos[`k${i}`] = { url: `u${i}`, ts: i };
        expect(listarMidia(brutos, 3).map(x => x.id)).toEqual(['k3', 'k4', 'k5']);
    });
    it('limite padrão é LIMITE_MIDIA', () => {
        const brutos = {};
        for (let i = 1; i <= LIMITE_MIDIA + 10; i++) brutos[`k${i}`] = { url: `u${i}`, ts: i };
        const r = listarMidia(brutos);
        expect(r).toHaveLength(LIMITE_MIDIA);
        expect(r[r.length - 1].id).toBe(`k${LIMITE_MIDIA + 10}`);
    });
    it('descarta entradas inválidas', () => {
        const r = listarMidia({ a: null, b: 'texto', c: { url: '' }, d: { ts: 1 }, e: { url: 5 }, f: { url: 'ok', ts: 1 } });
        expect(r.map(x => x.id)).toEqual(['f']);
    });
    it('entrada não-objeto vira lista vazia', () => {
        expect(listarMidia(null)).toEqual([]);
        expect(listarMidia(undefined)).toEqual([]);
        expect(listarMidia('x')).toEqual([]);
        expect(listarMidia({})).toEqual([]);
    });
    it('ts ausente conta como 0', () => {
        const r = listarMidia({ a: { url: 'u', ts: 5 }, b: { url: 'u2' } });
        expect(r.map(x => x.id)).toEqual(['b', 'a']);
    });
});

describe('podeApagarMidia', () => {
    const e = { autor: 'Ana' };
    it('Mestre apaga qualquer uma', () => expect(podeApagarMidia(e, { ehMestre: true, meuNome: 'Zed' })).toBe(true));
    it('autor apaga a própria', () => expect(podeApagarMidia(e, { meuNome: 'Ana' })).toBe(true));
    it('outro jogador não', () => expect(podeApagarMidia(e, { meuNome: 'Bia' })).toBe(false));
    it('sem nome não, mesmo com autor vazio', () => expect(podeApagarMidia({ autor: '' }, { meuNome: '' })).toBe(false));
    it('entrada nula e sem opções', () => {
        expect(podeApagarMidia(null, { ehMestre: true })).toBe(false);
        expect(podeApagarMidia(e)).toBe(false);
    });
});

describe('nomeDeNpcValido', () => {
    it('aceita e apara espaços', () => expect(nomeDeNpcValido('  Goblin  ')).toEqual({ ok: true, nome: 'Goblin' }));
    it.each([[''], ['   '], [null], [undefined]])('recusa nome vazio %j', (n) => {
        const r = nomeDeNpcValido(n);
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/nome/i);
    });
    it('limite de tamanho', () => {
        expect(nomeDeNpcValido('a'.repeat(LIMITE_NOME_NPC)).ok).toBe(true);
        const r = nomeDeNpcValido('a'.repeat(LIMITE_NOME_NPC + 1));
        expect(r.ok).toBe(false);
        expect(r.motivo).toContain(String(LIMITE_NOME_NPC));
    });
    it('duplicado sem diferenciar maiúsculas', () => {
        const r = nomeDeNpcValido('goblin', ['Ana', 'GOBLIN']);
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/Já existe/);
    });
    it('existentes nulo não quebra', () => expect(nomeDeNpcValido('X', null).ok).toBe(true));
});

describe('montarFichaNpcDeImagem', () => {
    it('preserva a base e define avatar, isNPC, bio.mesa, nome', () => {
        const base = { forca: 5, avatar: { zoom: 2, base: 'velha' }, bio: { classe: 'Mago', idade: 30 } };
        const f = montarFichaNpcDeImagem(base, 'Orc', 'http://img', 123);
        expect(f.forca).toBe(5);
        expect(f.avatar).toEqual({ zoom: 2, base: 'http://img' });
        expect(f.bio).toEqual({ classe: 'Mago', idade: 30, mesa: 'npc' });
        expect(f.isNPC).toBe(true);
        expect(f.nome).toBe('Orc');
        expect(f.dataCriacao).toBe(123);
    });
    it('classe padrão NPC quando não há', () => {
        expect(montarFichaNpcDeImagem({}, 'A', 'u').bio.classe).toBe('NPC');
    });
    it('base nula funciona e não muta a base', () => {
        const f = montarFichaNpcDeImagem(null, 'A', 'u');
        expect(f.avatar.base).toBe('u');
        const base = { avatar: { base: 'x' }, bio: {} };
        montarFichaNpcDeImagem(base, 'A', 'u');
        expect(base).toEqual({ avatar: { base: 'x' }, bio: {} });
    });
    it('dataCriacao padrão é um timestamp', () => {
        expect(typeof montarFichaNpcDeImagem({}, 'A', 'u').dataCriacao).toBe('number');
    });
});

const fb = (caminho, host = 'firebasestorage.googleapis.com', proto = 'https:') =>
    `${proto}//${host}/v0/b/bkt.appspot.com/o/${encodeURIComponent(caminho)}?alt=media&token=t`;

describe('urlDeMidiaSegura', () => {
    it('aceita arquivo da pasta de mídia da mesa', () => {
        expect(urlDeMidiaSegura(fb('mesas/m1/midia/a.png'), 'm1')).toBe(true);
    });
    it('recusa outra mesa, outra pasta, outro host e http', () => {
        expect(urlDeMidiaSegura(fb('mesas/m2/midia/a.png'), 'm1')).toBe(false);
        expect(urlDeMidiaSegura(fb('mesas/m1/avatares/a.png'), 'm1')).toBe(false);
        expect(urlDeMidiaSegura(fb('mesas/m1/midia/a.png', 'evil.example'), 'm1')).toBe(false);
        expect(urlDeMidiaSegura(fb('mesas/m1/midia/a.png', 'firebasestorage.googleapis.com', 'http:'), 'm1')).toBe(false);
    });
    it('recusa prefixo de mesa parecido (m1x) e lixo', () => {
        expect(urlDeMidiaSegura(fb('mesas/m1x/midia/a.png'), 'm1')).toBe(false);
        expect(urlDeMidiaSegura('nao-e-url', 'm1')).toBe(false);
        expect(urlDeMidiaSegura(null, 'm1')).toBe(false);
        expect(urlDeMidiaSegura(fb('mesas/m1/midia/a.png'), '')).toBe(false);
        expect(urlDeMidiaSegura('https://firebasestorage.googleapis.com/outra/rota', 'm1')).toBe(false);
    });
});

describe('listarMidia com mesaId e constantes novas', () => {
    it('filtra URLs inseguras quando recebe mesaId', () => {
        const r = listarMidia({
            a: { url: fb('mesas/m1/midia/a.png'), ts: 1 }, b: { url: 'https://evil.example/x.png', ts: 2 },
        }, 40, 'm1');
        expect(r.map(x => x.id)).toEqual(['a']);
    });
    it('sem mesaId não filtra por URL', () => {
        expect(listarMidia({ b: { url: 'https://qualquer/x.png', ts: 2 } }).map(x => x.id)).toEqual(['b']);
    });
    it('data URL de imagem pequena é aceito; grande, SVG ou lixo não', () => {
        const ok = 'data:image/webp;base64,AAAA';
        expect(ehDataUrlDeImagem(ok)).toBe(true);
        expect(urlDeMidiaSegura(ok, 'm1')).toBe(true);
        expect(ehDataUrlDeImagem('data:image/svg+xml;base64,AAAA')).toBe(false);
        expect(ehDataUrlDeImagem('data:text/html;base64,AAAA')).toBe(false);
        expect(ehDataUrlDeImagem('data:image/png;base64,' + 'A'.repeat(LIMITE_DATA_URL))).toBe(false);
        expect(ehDataUrlDeImagem(null)).toBe(false);
    });
});

describe('ehDataUrlDeImagem / urlDeMidiaSegura: lacunas', () => {
    it('aceita png, jpg, jpeg, webp e gif; recusa avif/bmp/svg e esquema em maiúsculas', () => {
        for (const t of ['png', 'jpg', 'jpeg', 'webp', 'gif']) expect(ehDataUrlDeImagem(`data:image/${t};base64,AAAA`)).toBe(true);
        for (const t of ['avif', 'bmp', 'svg+xml']) expect(ehDataUrlDeImagem(`data:image/${t};base64,AAAA`)).toBe(false);
        expect(ehDataUrlDeImagem('DATA:image/png;base64,AAAA')).toBe(false);
    });
    it('recusa base64 vazio, com espaço/quebra de linha, sem base64 e não-string', () => {
        expect(ehDataUrlDeImagem('data:image/png;base64,')).toBe(false);
        expect(ehDataUrlDeImagem('data:image/png;base64,AA AA')).toBe(false);
        expect(ehDataUrlDeImagem('data:image/png;base64,AAAA\n')).toBe(false);
        expect(ehDataUrlDeImagem('data:image/png,AAAA')).toBe(false);
        expect(ehDataUrlDeImagem(123)).toBe(false);
        expect(ehDataUrlDeImagem(undefined)).toBe(false);
    });
    it('limite exato: LIMITE_DATA_URL caracteres passa, +1 não', () => {
        const base = 'data:image/png;base64,';
        expect(ehDataUrlDeImagem(base + 'A'.repeat(LIMITE_DATA_URL - base.length))).toBe(true);
        expect(ehDataUrlDeImagem(base + 'A'.repeat(LIMITE_DATA_URL - base.length + 1))).toBe(false);
    });
    it('urlDeMidiaSegura aceita data URL mesmo sem mesaId; recusa data URL inválido e javascript:', () => {
        expect(urlDeMidiaSegura('data:image/png;base64,AAAA', '')).toBe(true);
        expect(urlDeMidiaSegura('data:image/svg+xml;base64,AAAA', 'm1')).toBe(false);
        expect(urlDeMidiaSegura('javascript:alert(1)', 'm1')).toBe(false);
    });
});

describe('descreverErroMidia: lacunas', () => {
    it('permission tem prioridade sobre motivo; detalhe longo é truncado em 120', () => {
        expect(descreverErroMidia({ code: 'PERMISSION_DENIED', motivo: 'x' })).toMatch(/permission_denied/);
        const msg = descreverErroMidia({ message: 'm'.repeat(300) });
        expect(msg).toContain('m'.repeat(120));
        expect(msg).not.toContain('m'.repeat(121));
        expect(descreverErroMidia(undefined)).not.toMatch(/\(\)/);
    });
});

describe('descreverErroMidia', () => {
    it('permission_denied', () => expect(descreverErroMidia({ code: 'PERMISSION_DENIED' })).toMatch(/permission_denied/));
    it('storage/unauthorized', () => {
        expect(descreverErroMidia({ code: 'storage/unauthorized' })).toMatch(/armazenamento.*storage\/unauthorized/);
        expect(descreverErroMidia({ codigo: 'storage/quota-exceeded' })).toMatch(/armazenamento/);
    });
    it('usa o motivo', () => expect(descreverErroMidia({ motivo: 'Sem conexão com a mesa.' })).toBe('Sem conexão com a mesa.'));
    it('genérico para o resto', () => {
        expect(descreverErroMidia(null)).toMatch(/Não foi possível enviar/);
        expect(descreverErroMidia(new Error('x'))).toMatch(/Não foi possível enviar.*\(x\)/);
    });
});
