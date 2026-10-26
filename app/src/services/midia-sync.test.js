import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    enviarImagemMidia, apagarImagemMidia, limparMidia, marcarImagemUsada, criarPersonagemNaMesa, iniciarListenerMidia, personagemExiste,
} from './midia-sync';
import useStore from '../stores/useStore';
import { push, set, update, remove, get, onValue } from 'firebase/database';
import { uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const URL_OK = vi.hoisted(() => (n, mesa = 'mesa1') =>
    `https://firebasestorage.googleapis.com/v0/b/bkt.appspot.com/o/mesas%2F${mesa}%2Fmidia%2F${n}?alt=media&token=t`);

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    push: vi.fn(() => ({ key: 'novoId' })),
    set: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
    onValue: vi.fn(),
    limitToLast: vi.fn((n) => ({ limite: n })),
    query: vi.fn((r) => r),
}));
vi.mock('firebase/storage', () => ({
    ref: vi.fn((st, path) => ({ path })),
    uploadBytes: vi.fn(() => Promise.resolve()),
    getDownloadURL: vi.fn(() => Promise.resolve(URL_OK('novo.gif'))),
    deleteObject: vi.fn(() => Promise.resolve()),
}));
vi.mock('./firebase-config', () => ({ db: {}, storage: {} }));
vi.mock('../stores/useStore', () => ({
    default: { getState: vi.fn() },
    sanitizarNome: vi.fn((n) => String(n).replace(/[.#$[\]/]/g, '_')),
}));

const arquivo = (over = {}) => ({ name: 'foto.gif', type: 'image/gif', size: 1000, ...over });

beforeEach(() => {
    vi.clearAllMocks();
    useStore.getState.mockReturnValue({ mesaId: 'mesa1' });
});

describe('enviarImagemMidia', () => {
    it('rejeita arquivo inválido sem subir nada', async () => {
        const r = await enviarImagemMidia(arquivo({ type: 'application/pdf' }), 'Ana');
        expect(r.ok).toBe(false);
        expect(r.erro.motivo).toMatch(/imagem/i);
        expect(uploadBytes).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });
    it('arquivo gigante ou nulo também é rejeitado', async () => {
        expect((await enviarImagemMidia(arquivo({ size: 13 * 1024 * 1024 }), 'Ana')).ok).toBe(false);
        expect((await enviarImagemMidia(null, 'Ana')).ok).toBe(false);
        expect(uploadBytes).not.toHaveBeenCalled();
    });
    it('sem mesa não envia', async () => {
        useStore.getState.mockReturnValue({ mesaId: '' });
        const r = await enviarImagemMidia(arquivo(), 'Ana');
        expect(r.ok).toBe(false);
        expect(uploadBytes).not.toHaveBeenCalled();
    });
    it('sobe o arquivo e grava { autor, url, ts, nome } em mesas/{mesaId}/midia', async () => {
        const f = arquivo();
        const r = await enviarImagemMidia(f, 'Ana');
        expect(r).toEqual({ ok: true, id: 'novoId' });
        expect(uploadBytes).toHaveBeenCalledTimes(1);
        expect(uploadBytes.mock.calls[0][0].path).toMatch(/^mesas\/mesa1\/midia\/\d+_[a-z0-9]+\.gif$/);
        expect(uploadBytes.mock.calls[0][1]).toBe(f); // GIF não é recomprimido
        expect(push).toHaveBeenCalledWith('mesas/mesa1/midia');
        const [alvo, dados] = set.mock.calls[0];
        expect(alvo).toEqual({ key: 'novoId' });
        expect(dados).toEqual({ autor: 'Ana', url: URL_OK('novo.gif'), ts: expect.any(Number), nome: 'foto.gif' });
    });
    it('recusa quando a imagem (já reduzida) tem 5 MB ou mais, sem subir', async () => {
        const r = await enviarImagemMidia(arquivo({ size: 5 * 1024 * 1024 }), 'Ana');
        expect(r.ok).toBe(false);
        expect(r.erro.motivo).toMatch(/5 MB/);
        expect(uploadBytes).not.toHaveBeenCalled();
    });
    it('a extensão vem do tipo do arquivo (png, jpg, img desconhecido)', async () => {
        // createImageBitmap não existe no jsdom: reduzirImagem devolve o arquivo original.
        await enviarImagemMidia(arquivo({ name: 'a.png', type: 'image/png' }), 'Ana');
        await enviarImagemMidia(arquivo({ name: 'a.jpeg', type: 'image/jpeg' }), 'Ana');
        await enviarImagemMidia(arquivo({ name: 'a.bmp', type: 'image/bmp' }), 'Ana');
        const caminhos = uploadBytes.mock.calls.map(c => c[0].path);
        expect(caminhos[0]).toMatch(/\.png$/);
        expect(caminhos[1]).toMatch(/\.jpg$/);
        expect(caminhos[2]).toMatch(/\.img$/);
    });
    it('trunca autor (50) e nome (60)', async () => {
        await enviarImagemMidia(arquivo({ name: 'n'.repeat(100) + '.gif' }), 'a'.repeat(80));
        const dados = set.mock.calls[0][1];
        expect(dados.autor).toHaveLength(50);
        expect(dados.nome).toHaveLength(60);
    });
    it('falha do Storage devolve { ok:false, erro } e não grava no banco', async () => {
        const err = { code: 'storage/unauthorized' };
        uploadBytes.mockRejectedValueOnce(err);
        const r = await enviarImagemMidia(arquivo(), 'Ana');
        expect(r).toEqual({ ok: false, erro: err });
        expect(set).not.toHaveBeenCalled();
    });
    it('falha ao gravar no banco devolve erro', async () => {
        set.mockRejectedValueOnce({ code: 'PERMISSION_DENIED' });
        const r = await enviarImagemMidia(arquivo(), 'Ana');
        expect(r.ok).toBe(false);
        expect(r.erro.code).toBe('PERMISSION_DENIED');
    });
    it('falha ao obter a URL devolve erro', async () => {
        getDownloadURL.mockRejectedValueOnce(new Error('x'));
        expect((await enviarImagemMidia(arquivo(), 'Ana')).ok).toBe(false);
        expect(set).not.toHaveBeenCalled();
    });
});

describe('apagarImagemMidia', () => {
    it('remove a entrada e apaga o arquivo quando não usada em ficha', async () => {
        const ok = await apagarImagemMidia({ id: 'i1', url: URL_OK('a.png') });
        expect(ok).toBe(true);
        expect(remove).toHaveBeenCalledWith('mesas/mesa1/midia/i1');
        expect(deleteObject).toHaveBeenCalledTimes(1);
        expect(deleteObject.mock.calls[0][0].path).toBe(URL_OK('a.png'));
    });
    it('nunca apaga arquivo fora da pasta de mídia desta mesa (URL maliciosa)', async () => {
        const avatar = 'https://firebasestorage.googleapis.com/v0/b/bkt/o/mesas%2Fmesa1%2Favatares%2Fx.png?alt=media';
        await expect(apagarImagemMidia({ id: 'i1', url: avatar })).resolves.toBe(true);
        await expect(apagarImagemMidia({ id: 'i2', url: URL_OK('b.png', 'outraMesa') })).resolves.toBe(true);
        await expect(apagarImagemMidia({ id: 'i3', url: 'https://evil.example/x.png' })).resolves.toBe(true);
        expect(remove).toHaveBeenCalledTimes(3);
        expect(deleteObject).not.toHaveBeenCalled();
    });
    it('não apaga o arquivo se usadaEmFicha', async () => {
        const ok = await apagarImagemMidia({ id: 'i1', url: URL_OK('a.png'), usadaEmFicha: true });
        expect(ok).toBe(true);
        expect(remove).toHaveBeenCalledWith('mesas/mesa1/midia/i1');
        expect(deleteObject).not.toHaveBeenCalled();
    });
    it('falha ao apagar o arquivo não impede o sucesso', async () => {
        deleteObject.mockRejectedValueOnce(new Error('404'));
        await expect(apagarImagemMidia({ id: 'i1', url: URL_OK('a.png') })).resolves.toBe(true);
    });
    it('falha do remove devolve false e não toca no arquivo', async () => {
        remove.mockRejectedValueOnce(new Error('x'));
        await expect(apagarImagemMidia({ id: 'i1', url: URL_OK('a.png') })).resolves.toBe(false);
        expect(deleteObject).not.toHaveBeenCalled();
    });
    it('entrada sem id, nula ou sem mesa => false', async () => {
        await expect(apagarImagemMidia({ url: 'u' })).resolves.toBe(false);
        await expect(apagarImagemMidia(null)).resolves.toBe(false);
        useStore.getState.mockReturnValue({ mesaId: '' });
        await expect(apagarImagemMidia({ id: 'i' })).resolves.toBe(false);
        expect(remove).not.toHaveBeenCalled();
    });
});

describe('limparMidia', () => {
    it('remove o nó e apaga só os arquivos não usados (e seguros)', async () => {
        get.mockResolvedValue({
            exists: () => true,
            val: () => ({
                a: { url: URL_OK('a.png') }, b: { url: URL_OK('b.png'), usadaEmFicha: true }, c: { url: URL_OK('c.png') },
                d: null, e: { nome: 'sem url' }, f: { url: 'https://evil.example/x.png' },
            }),
        });
        const r = await limparMidia();
        expect(r).toEqual({ ok: true, apagadas: 3, mantidas: 3 });
        expect(deleteObject.mock.calls.map(c => c[0].path).sort()).toEqual([URL_OK('a.png'), URL_OK('c.png')]);
        expect(remove).toHaveBeenCalledWith('mesas/mesa1/midia');
    });
    it('remove o banco ANTES de apagar os arquivos', async () => {
        const ordem = [];
        get.mockResolvedValue({ exists: () => true, val: () => ({ a: { url: URL_OK('a.png') } }) });
        remove.mockImplementationOnce(async () => { ordem.push('remove'); });
        deleteObject.mockImplementationOnce(async () => { ordem.push('delete'); });
        await limparMidia();
        expect(ordem).toEqual(['remove', 'delete']);
    });
    it('se o remove do banco falha, nenhum arquivo é apagado', async () => {
        get.mockResolvedValue({ exists: () => true, val: () => ({ a: { url: URL_OK('a.png') } }) });
        remove.mockRejectedValueOnce({ code: 'PERMISSION_DENIED' });
        expect(await limparMidia()).toEqual({ ok: false, apagadas: 0 });
        expect(deleteObject).not.toHaveBeenCalled();
    });
    it('nó vazio: remove e devolve 0', async () => {
        get.mockResolvedValue({ exists: () => false, val: () => null });
        expect(await limparMidia()).toEqual({ ok: true, apagadas: 0, mantidas: 0 });
        expect(deleteObject).not.toHaveBeenCalled();
    });
    it('falha devolve { ok:false, apagadas:0 }', async () => {
        get.mockRejectedValue(new Error('x'));
        expect(await limparMidia()).toEqual({ ok: false, apagadas: 0 });
        expect(remove).not.toHaveBeenCalled();
    });
    it('sem mesa não faz nada', async () => {
        useStore.getState.mockReturnValue({ mesaId: '' });
        expect(await limparMidia()).toEqual({ ok: false, apagadas: 0 });
        expect(get).not.toHaveBeenCalled();
    });
});

describe('marcarImagemUsada', () => {
    it('faz update { usadaEmFicha: true } na entrada', async () => {
        await expect(marcarImagemUsada('i1')).resolves.toBe(true);
        expect(update).toHaveBeenCalledWith('mesas/mesa1/midia/i1', { usadaEmFicha: true });
    });
    it('id vazio => false; erro => false', async () => {
        await expect(marcarImagemUsada('')).resolves.toBe(false);
        expect(update).not.toHaveBeenCalled();
        update.mockRejectedValueOnce(new Error('x'));
        await expect(marcarImagemUsada('i1')).resolves.toBe(false);
    });
});

describe('personagemExiste', () => {
    it('consulta personagens/{chave sanitizada}', async () => {
        get.mockResolvedValue({ exists: () => true });
        await expect(personagemExiste('Dr. Evil')).resolves.toBe(true);
        expect(get).toHaveBeenCalledWith('mesas/mesa1/personagens/Dr_ Evil');
    });
    it('erro, nome vazio ou sem mesa => false', async () => {
        get.mockRejectedValueOnce(new Error('x'));
        await expect(personagemExiste('X')).resolves.toBe(false);
        await expect(personagemExiste('')).resolves.toBe(false);
        useStore.getState.mockReturnValue({ mesaId: '' });
        await expect(personagemExiste('X')).resolves.toBe(false);
    });
});

describe('criarPersonagemNaMesa', () => {
    beforeEach(() => { get.mockResolvedValue({ exists: () => false }); });
    it('grava a ficha em personagens/{nome sanitizado}', async () => {
        const ficha = { nome: 'Dr. Evil', isNPC: true };
        await expect(criarPersonagemNaMesa('Dr. Evil', ficha)).resolves.toBe(true);
        expect(set).toHaveBeenCalledWith('mesas/mesa1/personagens/Dr_ Evil', ficha);
    });
    it('nunca sobrescreve um personagem existente', async () => {
        get.mockResolvedValue({ exists: () => true });
        await expect(criarPersonagemNaMesa('Ana', { nome: 'Ana' })).resolves.toBe(false);
        expect(set).not.toHaveBeenCalled();
    });
    it('sem ficha, sem nome ou sem mesa => false', async () => {
        await expect(criarPersonagemNaMesa('X', null)).resolves.toBe(false);
        await expect(criarPersonagemNaMesa('', {})).resolves.toBe(false);
        useStore.getState.mockReturnValue({ mesaId: '' });
        await expect(criarPersonagemNaMesa('X', {})).resolves.toBe(false);
        expect(set).not.toHaveBeenCalled();
    });
    it('erro de gravação => false', async () => {
        set.mockRejectedValueOnce(new Error('x'));
        await expect(criarPersonagemNaMesa('X', {})).resolves.toBe(false);
    });
});

describe('iniciarListenerMidia', () => {
    it('devolve a lista ordenada (sem URLs de fora da pasta da mesa) e o cancelador', () => {
        const cancela = vi.fn();
        onValue.mockReturnValue(cancela);
        const cb = vi.fn();
        const c = iniciarListenerMidia(cb);
        expect(c).toBe(cancela);
        onValue.mock.calls[0][1]({ val: () => ({
            b: { url: URL_OK('2.png'), ts: 2 }, a: { url: URL_OK('1.png'), ts: 1 }, x: { url: 'https://evil.example/t.gif', ts: 3 },
        }) });
        expect(cb).toHaveBeenCalledWith([{ id: 'a', url: URL_OK('1.png'), ts: 1 }, { id: 'b', url: URL_OK('2.png'), ts: 2 }]);
    });
    it('snapshot vazio => lista vazia', () => {
        onValue.mockReturnValue(vi.fn());
        const cb = vi.fn();
        iniciarListenerMidia(cb);
        onValue.mock.calls[0][1]({ val: () => null });
        expect(cb).toHaveBeenCalledWith([]);
    });
    it('repassa erro ao aoErro', () => {
        onValue.mockReturnValue(vi.fn());
        const aoErro = vi.fn();
        iniciarListenerMidia(vi.fn(), aoErro);
        const e = new Error('perm');
        onValue.mock.calls[0][2](e);
        expect(aoErro).toHaveBeenCalledWith(e);
    });
    it('sem mesa devolve cancelador inócuo', () => {
        useStore.getState.mockReturnValue({ mesaId: '' });
        const c = iniciarListenerMidia(vi.fn());
        expect(() => c()).not.toThrow();
        expect(onValue).not.toHaveBeenCalled();
    });
});
