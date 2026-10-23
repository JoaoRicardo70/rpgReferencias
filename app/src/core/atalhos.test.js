import { describe, it, expect, beforeEach } from 'vitest';
import {
    CHAVE_ATALHOS, ACOES_ATALHO, nomeDaTecla, eventoParaAtalho, atalhoValido, modificadorValido, lerAtalhosSalvos,
    getAtalho, getTodosAtalhos, salvarAtalho, restaurarAtalhos, acaoEmConflito, eventoCombina, digitoDaAba, formatarAtalho
} from './atalhos';

beforeEach(() => { localStorage.clear(); });
const salvos = () => JSON.parse(localStorage.getItem(CHAVE_ATALHOS));

describe('nomeDaTecla / eventoParaAtalho', () => {
    it('usa o code para letras, digitos, numpad e F-keys', () => {
        expect(nomeDaTecla({ code: 'KeyK', key: 'k' })).toBe('K');
        expect(nomeDaTecla({ code: 'Digit7', key: '7' })).toBe('7');
        expect(nomeDaTecla({ code: 'Numpad4', key: '4' })).toBe('4');
        expect(nomeDaTecla({ code: 'F5', key: 'F5' })).toBe('F5');
    });
    it('Alt+tecla no Mac (key diferente) ainda usa o code', () => {
        expect(nomeDaTecla({ code: 'KeyL', key: '¬' })).toBe('L');
    });
    it('cai para key sem code', () => {
        expect(nomeDaTecla({ key: 'a' })).toBe('A');
        expect(nomeDaTecla({ key: ' ' })).toBe('Espaço');
        expect(nomeDaTecla({ key: 'ArrowUp' })).toBe('ArrowUp');
    });
    it('so modificador, vazio ou nulo devolve vazio', () => {
        ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].forEach(key => expect(nomeDaTecla({ key })).toBe(''));
        expect(nomeDaTecla({})).toBe('');
        expect(nomeDaTecla(null)).toBe('');
        expect(nomeDaTecla(undefined)).toBe('');
    });
    it('monta combinacao em ordem Ctrl, Alt, Shift e trata Meta como Ctrl', () => {
        expect(eventoParaAtalho({ code: 'KeyK', ctrlKey: true })).toBe('Ctrl+K');
        expect(eventoParaAtalho({ code: 'KeyK', metaKey: true })).toBe('Ctrl+K');
        expect(eventoParaAtalho({ code: 'KeyL', shiftKey: true, altKey: true, ctrlKey: true })).toBe('Ctrl+Alt+Shift+L');
        expect(eventoParaAtalho({ code: 'KeyL' })).toBe('L');
    });
    it('so modificador pressionado gera texto vazio', () => {
        expect(eventoParaAtalho({ key: 'Control', ctrlKey: true })).toBe('');
    });
});

describe('atalhoValido / modificadorValido', () => {
    it('aceita modificador + tecla e teclas F', () => {
        expect(atalhoValido('Ctrl+K')).toBe(true);
        expect(atalhoValido('Alt+Shift+L')).toBe(true);
        expect(atalhoValido('F2')).toBe(true);
        expect(atalhoValido('F12')).toBe(true);
    });
    it('recusa atalho sem modificador', () => {
        expect(atalhoValido('K')).toBe(false);
        expect(atalhoValido('5')).toBe(false);
        expect(atalhoValido('Espaço')).toBe(false);
    });
    it('recusa vazio, nulo, modificador estranho', () => {
        expect(atalhoValido('')).toBe(false);
        expect(atalhoValido(null)).toBe(false);
        expect(atalhoValido(undefined)).toBe(false);
        expect(atalhoValido('Foo+K')).toBe(false);
    });
    it('modificadorValido', () => {
        expect(modificadorValido('Alt')).toBe(true);
        expect(modificadorValido('Ctrl+Shift')).toBe(true);
        expect(modificadorValido('')).toBe(false);
        expect(modificadorValido(null)).toBe(false);
        expect(modificadorValido('Alt+K')).toBe(false);
        expect(modificadorValido('Meta')).toBe(false);
    });
});

describe('leitura e padroes', () => {
    it('sem nada salvo usa os padroes', () => {
        expect(getTodosAtalhos()).toEqual({ paleta: 'Ctrl+K', abas: 'Alt', livroCombate: 'Alt+L', gravarClipe: 'Alt+C' });
        expect(getAtalho('paleta')).toBe('Ctrl+K');
    });
    it('id desconhecido devolve vazio', () => { expect(getAtalho('nao-existe')).toBe(''); });
    it('JSON corrompido cai nos padroes', () => {
        localStorage.setItem(CHAVE_ATALHOS, '{nao e json');
        expect(lerAtalhosSalvos()).toEqual({});
        expect(getAtalho('paleta')).toBe('Ctrl+K');
    });
    it.each(['null', '[]', '"texto"', '42'])('storage com %s cai nos padroes', (v) => {
        localStorage.setItem(CHAVE_ATALHOS, v);
        expect(lerAtalhosSalvos()).toEqual({});
        expect(getTodosAtalhos().paleta).toBe('Ctrl+K');
    });
    it('valores invalidos salvos usam o padrao', () => {
        localStorage.setItem(CHAVE_ATALHOS, JSON.stringify({ paleta: 'K', abas: 'Alt+K', livroCombate: 123, gravarClipe: null }));
        expect(getTodosAtalhos()).toEqual({ paleta: 'Ctrl+K', abas: 'Alt', livroCombate: 'Alt+L', gravarClipe: 'Alt+C' });
    });
    it('valor valido salvo e usado', () => {
        localStorage.setItem(CHAVE_ATALHOS, JSON.stringify({ paleta: 'Ctrl+J', abas: 'Ctrl+Shift' }));
        expect(getAtalho('paleta')).toBe('Ctrl+J');
        expect(getAtalho('abas')).toBe('Ctrl+Shift');
    });
    it('aceita storage injetado', () => {
        expect(lerAtalhosSalvos({ getItem: () => JSON.stringify({ paleta: 'Alt+P' }) })).toEqual({ paleta: 'Alt+P' });
    });
    it('storage que lanca erro devolve vazio', () => {
        expect(lerAtalhosSalvos({ getItem: () => { throw new Error('x'); } })).toEqual({});
    });
});

describe('salvarAtalho / restaurarAtalhos', () => {
    it('salva atalho valido', () => {
        expect(salvarAtalho('paleta', 'Ctrl+J')).toEqual({ ok: true, motivo: '' });
        expect(salvos()).toEqual({ paleta: 'Ctrl+J' });
        expect(getAtalho('paleta')).toBe('Ctrl+J');
    });
    it('acumula varias acoes', () => {
        salvarAtalho('paleta', 'Ctrl+J');
        salvarAtalho('livroCombate', 'Alt+B');
        expect(salvos()).toEqual({ paleta: 'Ctrl+J', livroCombate: 'Alt+B' });
    });
    it('atalho sem modificador e recusado e nada e gravado', () => {
        const r = salvarAtalho('paleta', 'K');
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/Ctrl ou Alt/);
        expect(localStorage.getItem(CHAVE_ATALHOS)).toBeNull();
    });
    it('modificador de abas invalido e recusado', () => {
        const r = salvarAtalho('abas', 'Alt+K');
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/Escolha um modificador com Ctrl ou Alt/);
    });
    it('modificador de abas valido e salvo', () => {
        expect(salvarAtalho('abas', 'Ctrl+Shift').ok).toBe(true);
        expect(getAtalho('abas')).toBe('Ctrl+Shift');
    });
    it('acao desconhecida e recusada', () => {
        expect(salvarAtalho('xyz', 'Ctrl+K').ok).toBe(false);
    });
    it('atalho igual ao de outra acao e recusado', () => {
        const r = salvarAtalho('livroCombate', 'Ctrl+K');
        expect(r.ok).toBe(false);
        expect(r.motivo).toContain('Abrir a busca');
        expect(localStorage.getItem(CHAVE_ATALHOS)).toBeNull();
    });
    it('regravar o mesmo atalho da propria acao nao e conflito', () => {
        expect(salvarAtalho('paleta', 'Ctrl+K').ok).toBe(true);
    });
    it('falha ao gravar devolve erro sem lancar', () => {
        const r = salvarAtalho('paleta', 'Ctrl+J', { getItem: () => null, setItem: () => { throw new Error('cheio'); } });
        expect(r.ok).toBe(false);
    });
    it('restaurar remove tudo', () => {
        salvarAtalho('paleta', 'Ctrl+J');
        restaurarAtalhos();
        expect(localStorage.getItem(CHAVE_ATALHOS)).toBeNull();
        expect(getAtalho('paleta')).toBe('Ctrl+K');
    });
    it('restaurar sem nada salvo nao falha', () => { expect(() => restaurarAtalhos()).not.toThrow(); });
});

describe('acaoEmConflito', () => {
    it('sem conflito devolve null', () => { expect(acaoEmConflito('paleta', 'Ctrl+J')).toBeNull(); });
    it('combinacao igual a de outra acao', () => {
        expect(acaoEmConflito('paleta', 'Alt+L').id).toBe('livroCombate');
    });
    it('combinacao terminada em numero conflita com abas (Alt + 3)', () => {
        expect(acaoEmConflito('livroCombate', 'Alt+3').id).toBe('abas');
        expect(salvarAtalho('livroCombate', 'Alt+3').ok).toBe(false);
    });
    it('combinacao com outro modificador e numero nao conflita', () => {
        expect(acaoEmConflito('livroCombate', 'Alt+Shift+3')).toBeNull();
        expect(acaoEmConflito('livroCombate', 'Ctrl+3')).toBeNull();
    });
    it('combinacao terminada em 0 nao conflita com abas', () => {
        expect(acaoEmConflito('livroCombate', 'Alt+0')).toBeNull();
    });
    it('mudar abas para modificador que colide com combinacao existente com numero', () => {
        localStorage.setItem(CHAVE_ATALHOS, JSON.stringify({ paleta: 'Ctrl+5' }));
        expect(acaoEmConflito('abas', 'Ctrl').id).toBe('paleta');
        const r = salvarAtalho('abas', 'Ctrl');
        expect(r.ok).toBe(false);
        expect(r.motivo).toContain('Abrir a busca');
    });
    it('abas com modificador diferente do da combinacao nao conflita', () => {
        localStorage.setItem(CHAVE_ATALHOS, JSON.stringify({ paleta: 'Ctrl+5' }));
        expect(acaoEmConflito('abas', 'Alt')).toBeNull();
        expect(acaoEmConflito('abas', 'Ctrl+Shift')).toBeNull();
    });
});

describe('eventoCombina', () => {
    it('combina o atalho padrao', () => {
        expect(eventoCombina({ code: 'KeyK', ctrlKey: true }, 'paleta')).toBe(true);
        expect(eventoCombina({ code: 'KeyK', metaKey: true }, 'paleta')).toBe(true);
    });
    it('nao combina com modificador extra ou ausente', () => {
        expect(eventoCombina({ code: 'KeyK', ctrlKey: true, shiftKey: true }, 'paleta')).toBe(false);
        expect(eventoCombina({ code: 'KeyK' }, 'paleta')).toBe(false);
    });
    it('respeita atalho personalizado', () => {
        salvarAtalho('paleta', 'Ctrl+J');
        expect(eventoCombina({ code: 'KeyJ', ctrlKey: true }, 'paleta')).toBe(true);
        expect(eventoCombina({ code: 'KeyK', ctrlKey: true }, 'paleta')).toBe(false);
    });
    it('acao desconhecida nunca combina', () => {
        expect(eventoCombina({ code: 'KeyK', ctrlKey: true }, 'xyz')).toBe(false);
    });
});

describe('digitoDaAba', () => {
    it('Alt+Digit3 devolve "3"', () => { expect(digitoDaAba({ code: 'Digit3', key: '3', altKey: true })).toBe('3'); });
    it('Numpad tambem vale', () => { expect(digitoDaAba({ code: 'Numpad9', altKey: true })).toBe('9'); });
    it('exige e.code: so e.key nao vale', () => {
        expect(digitoDaAba({ key: '3', altKey: true })).toBeNull();
        expect(digitoDaAba({ key: '3', code: '', altKey: true })).toBeNull();
        expect(digitoDaAba({ key: '3', code: 'KeyE', altKey: true })).toBeNull();
    });
    it('Digit0 nao e aba', () => { expect(digitoDaAba({ code: 'Digit0', altKey: true })).toBeNull(); });
    it('sem o modificador, ou com extra, devolve null', () => {
        expect(digitoDaAba({ code: 'Digit3' })).toBeNull();
        expect(digitoDaAba({ code: 'Digit3', altKey: true, shiftKey: true })).toBeNull();
        expect(digitoDaAba({ code: 'Digit3', ctrlKey: true })).toBeNull();
    });
    it('usa o modificador personalizado', () => {
        salvarAtalho('abas', 'Ctrl+Shift');
        expect(digitoDaAba({ code: 'Digit2', ctrlKey: true, shiftKey: true })).toBe('2');
        expect(digitoDaAba({ code: 'Digit2', altKey: true })).toBeNull();
    });
    it('Cmd (metaKey) vale como Ctrl', () => {
        salvarAtalho('abas', 'Ctrl');
        expect(digitoDaAba({ code: 'Digit4', metaKey: true })).toBe('4');
    });
});

describe('formatarAtalho', () => {
    it('separa com " + "', () => { expect(formatarAtalho('Ctrl+Shift+K')).toBe('Ctrl + Shift + K'); });
    it('vazio/nulo', () => { expect(formatarAtalho('')).toBe(''); expect(formatarAtalho(null)).toBe(''); });
});

describe('ACOES_ATALHO', () => {
    it('padroes sao validos e sem conflito entre si', () => {
        ACOES_ATALHO.forEach(a => expect(a.tipo === 'modificador' ? modificadorValido(a.padrao) : atalhoValido(a.padrao)).toBe(true));
        ACOES_ATALHO.forEach(a => expect(acaoEmConflito(a.id, a.padrao)).toBeNull());
    });
});
