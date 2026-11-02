import { describe, it, expect, vi, beforeEach } from 'vitest';

const banco = { dados: {}, sets: [], removes: [], falhar: null };
const val = (p) => banco.dados[p];

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => ({ path })),
    set: vi.fn(async (r, v) => { if (banco.falhar) throw banco.falhar; banco.sets.push(r.path); banco.dados[r.path] = v; }),
    get: vi.fn(async (r) => {
        if (banco.falhar) throw banco.falhar;
        const p = r.path;
        let v = banco.dados[p];
        if (v === undefined) {
            const filhos = Object.keys(banco.dados).filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'));
            if (filhos.length) { v = {}; filhos.forEach(k => { v[k.slice(p.length + 1)] = banco.dados[k]; }); }
        }
        return { exists: () => v !== undefined, val: () => v };
    }),
    remove: vi.fn(async (r) => { if (banco.falharRemove) throw new Error('sem permissao para apagar'); banco.removes.push(r.path); delete banco.dados[r.path]; }),
}));
const cfgMock = vi.hoisted(() => ({ db: {}, mesaId: 'M1' }));
vi.mock('./firebase-config', () => ({ get db() { return cfgMock.db; } }));
vi.mock('../stores/useStore', () => ({
    default: { getState: () => ({ mesaId: cfgMock.mesaId, meuNome: 'Ana' }) },
    sanitizarNome: (n) => String(n).replace(/[.#$[\]/]/g, '_'),
}));

import { garantirBackupDiario, backupAntesDeImportar, listarBackups, lerBackup } from './backup-ficha';
import { dataDeHoje } from '../core/backupFicha';

const ficha = { vida: 10, bio: 'x', poderes: [1], inventario: [], mana: 5 };
const hoje = dataDeHoje(new Date(2026, 5, 15));
const agora = new Date(2026, 5, 15, 10, 0, 0);

beforeEach(() => { banco.dados = {}; banco.sets = []; banco.removes = []; banco.falhar = null; banco.falharRemove = false; });

describe('garantirBackupDiario', () => {
    it('grava backup de hoje e o indice', async () => {
        const r = await garantirBackupDiario('Ana', ficha, agora);
        expect(r).toMatchObject({ ok: true, chave: hoje });
        expect(val(`mesas/M1/backups/Ana/${hoje}`)).toEqual(ficha);
        expect(val(`mesas/M1/backupsIndice/Ana/${hoje}`)).toMatchObject({ imagensRemovidas: 0 });
        expect(typeof val(`mesas/M1/backupsIndice/Ana/${hoje}`).em).toBe('number');
    });
    it('nao grava de novo se hoje ja esta no indice', async () => {
        await garantirBackupDiario('Ana', ficha, agora);
        banco.sets = [];
        const r = await garantirBackupDiario('Ana', { ...ficha, vida: 99 }, agora);
        expect(r).toMatchObject({ ok: true, jaExistia: true });
        expect(banco.sets).toEqual([]);
        expect(val(`mesas/M1/backups/Ana/${hoje}`).vida).toBe(10);
    });
    it('poda as diárias acima de 15 apagando backup e indice das mais antigas', async () => {
        for (let i = 1; i <= 15; i++) {
            const k = `2026-05-${String(i).padStart(2, '0')}`;
            banco.dados[`mesas/M1/backups/Ana/${k}`] = ficha;
            banco.dados[`mesas/M1/backupsIndice/Ana/${k}`] = { em: i };
        }
        await garantirBackupDiario('Ana', ficha, agora);
        expect(banco.removes.sort()).toEqual([
            'mesas/M1/backups/Ana/2026-05-01', 'mesas/M1/backupsIndice/Ana/2026-05-01'
        ]);
        expect(val('mesas/M1/backups/Ana/2026-05-01')).toBeUndefined();
        expect(val(`mesas/M1/backups/Ana/${hoje}`)).toBeDefined();
    });
    it('as cópias "antes de importar" têm limite próprio e NÃO expulsam as diárias', async () => {
        for (let i = 1; i <= 10; i++) {
            const k = `2026-05-${String(i).padStart(2, '0')}`;
            banco.dados[`mesas/M1/backups/Ana/${k}`] = ficha;
            banco.dados[`mesas/M1/backupsIndice/Ana/${k}`] = { em: i };
        }
        for (let i = 1; i <= 5; i++) {
            const k = `2026-05-20_antes_1000${String(i).padStart(2, '0')}`;
            banco.dados[`mesas/M1/backups/Ana/${k}`] = ficha;
            banco.dados[`mesas/M1/backupsIndice/Ana/${k}`] = { em: 100 + i };
        }
        await backupAntesDeImportar('Ana', ficha, agora);
        // só uma "antes" (a mais antiga) sai; nenhuma diária
        expect(banco.removes.filter(r => r.includes('backups/Ana/')).every(r => r.includes('_antes_'))).toBe(true);
        expect(banco.removes.some(r => r.includes('Ana/2026-05-0') && !r.includes('_antes_'))).toBe(false);
    });
    it('falha ao podar não derruba a gravação do backup (nem bloqueia a importação)', async () => {
        for (let i = 1; i <= 16; i++) {
            const k = `2026-05-${String(i).padStart(2, '0')}`;
            banco.dados[`mesas/M1/backups/Ana/${k}`] = ficha;
            banco.dados[`mesas/M1/backupsIndice/Ana/${k}`] = { em: i };
        }
        banco.falharRemove = true;
        const r = await garantirBackupDiario('Ana', ficha, agora);
        expect(r.ok).toBe(true);
    });
    it('nao poda com 15 ou menos', async () => {
        await garantirBackupDiario('Ana', ficha, agora);
        expect(banco.removes).toEqual([]);
    });
    it('ficha pequena demais nao grava', async () => {
        const r = await garantirBackupDiario('Ana', { vida: 1 }, agora);
        expect(r).toEqual({ ok: false, erro: 'ficha-pequena-demais' });
        expect(banco.sets).toEqual([]);
    });
    it('ficha nula nao grava', async () => {
        expect((await garantirBackupDiario('Ana', null, agora)).ok).toBe(false);
    });
    it('nome vazio = sem-mesa', async () => {
        expect(await garantirBackupDiario('', ficha, agora)).toEqual({ ok: false, erro: 'sem-mesa' });
    });
    it('erro do Firebase devolve ok:false sem lancar', async () => {
        banco.falhar = Object.assign(new Error('x'), { code: 'PERMISSION_DENIED' });
        const r = await garantirBackupDiario('Ana', ficha, agora);
        expect(r).toEqual({ ok: false, erro: 'PERMISSION_DENIED' });
    });
    it('sanitiza o nome no caminho', async () => {
        await garantirBackupDiario('A.b', ficha, agora);
        expect(val(`mesas/M1/backups/A_b/${hoje}`)).toBeDefined();
    });
});

describe('backupAntesDeImportar', () => {
    it('grava com chave _antes_', async () => {
        const r = await backupAntesDeImportar('Ana', ficha, new Date(2026, 5, 15, 1, 2, 3));
        expect(r).toMatchObject({ ok: true, chave: '2026-06-15_antes_010203' });
        expect(val('mesas/M1/backups/Ana/2026-06-15_antes_010203')).toEqual(ficha);
        expect(val('mesas/M1/backupsIndice/Ana/2026-06-15_antes_010203')).toBeDefined();
    });
    it('erro devolve ok:false', async () => {
        banco.falhar = new Error('boom');
        expect(await backupAntesDeImportar('Ana', ficha)).toEqual({ ok: false, erro: 'boom' });
    });
    it('sem nome = sem-mesa', async () => {
        expect(await backupAntesDeImportar('', ficha)).toEqual({ ok: false, erro: 'sem-mesa' });
    });
});

describe('listarBackups', () => {
    it('lista do mais novo para o mais antigo', async () => {
        banco.dados['mesas/M1/backupsIndice/Ana/2026-01-01'] = { em: 1 };
        banco.dados['mesas/M1/backupsIndice/Ana/2026-01-03'] = { em: 3 };
        banco.dados['mesas/M1/backupsIndice/Ana/2026-01-02'] = { em: 2 };
        const r = await listarBackups('Ana');
        expect(r.ok).toBe(true);
        expect(r.itens.map(i => i.chave)).toEqual(['2026-01-03', '2026-01-02', '2026-01-01']);
        expect(r.itens[0].em).toBe(3);
    });
    it('vazio = lista vazia ok', async () => {
        expect(await listarBackups('Ana')).toEqual({ ok: true, itens: [] });
    });
    it('erro = ok:false', async () => {
        banco.falhar = Object.assign(new Error('x'), { code: 'PERMISSION_DENIED' });
        expect(await listarBackups('Ana')).toEqual({ ok: false, erro: 'PERMISSION_DENIED', itens: [] });
    });
});

describe('lerBackup', () => {
    it('le o backup existente', async () => {
        banco.dados['mesas/M1/backups/Ana/2026-01-01'] = ficha;
        expect(await lerBackup('Ana', '2026-01-01')).toEqual(ficha);
    });
    it('inexistente, sem chave ou erro = null', async () => {
        expect(await lerBackup('Ana', '2000-01-01')).toBeNull();
        expect(await lerBackup('Ana', '')).toBeNull();
        banco.falhar = new Error('x');
        expect(await lerBackup('Ana', '2026-01-01')).toBeNull();
    });
});

describe('sem mesa / sem db', () => {
    it('sem mesaId devolve ok:false e nao toca no banco', async () => {
        cfgMock.mesaId = '';
        try {
            expect((await garantirBackupDiario('Ana', ficha, agora)).ok).toBe(false);
            expect((await backupAntesDeImportar('Ana', ficha)).ok).toBe(false);
            expect((await listarBackups('Ana')).ok).toBe(false);
            expect(await lerBackup('Ana', 'x')).toBeNull();
            expect(banco.sets).toEqual([]);
        } finally { cfgMock.mesaId = 'M1'; }
    });
    it('sem db devolve ok:false', async () => {
        cfgMock.db = null;
        try {
            expect(await garantirBackupDiario('Ana', ficha, agora)).toEqual({ ok: false, erro: 'sem-mesa' });
            expect(banco.sets).toEqual([]);
        } finally { cfgMock.db = {}; }
    });
});
