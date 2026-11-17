import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesLista } from './PoderesSubComponents';
import useStore from '../../stores/useStore';

// 🕵️ Teste adversarial de vazamento no Grimório (cartões de Habilidade de Raça): a Raça "Saiyajin" (Domínio 70%) não pode aparecer
// (texto, title, aria-label, placeholder, value) para quem não a vê; para quem vê, aparece.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()), uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));
vi.mock('../../services/composicaoRacial', () => ({
    definirBloqueioDoPoder: vi.fn(() => ({ ok: true })), despertarHabilidade: vi.fn(() => ({ ok: true })),
    definirPercentualMinimoDoPoder: vi.fn(() => ({ ok: true })), definirManipulaDNA: vi.fn(() => ({ ok: true })),
    definirComposicaoRacial: vi.fn(() => ({ ok: true })), concederPraticaRacial: vi.fn(() => ({ ok: true })),
    adicionarRacaAdquirida: vi.fn(() => ({ ok: true })), removerRacaDaComposicao: vi.fn(() => ({ ok: true })),
    definirVisibilidadeRaca: vi.fn(() => ({ ok: true })),
}));

const CENARIO = { racas: [
    { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: ['Sayajin'], herdaDe: '' },
    { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' },
    { id: 'namekuseijin', nome: 'Namekuseijin', icone: '🟢', apelidos: [], herdaDe: '' },
] };
const hab = (extra) => ({ ativa: false, categoria: 'habilidadeRaca', efeitos: [], efeitosPassivos: [], ...extra });
const PODERES = () => [
    hab({ id: 7, nome: 'Zenkai', racasAcesso: ['saiyajin'], percentualMinimo: 80 }),
    hab({ id: 8, nome: 'Genki', racasAcesso: ['namekuseijin'] }),
    hab({ id: 9, nome: 'Hibrido', racasAcesso: ['saiyajin', 'humano'] }),
];
const bioCom = (vis) => ({
    raca: 'Saiyajin', racaId: 'saiyajin',
    composicaoRacial: [{ racaId: 'saiyajin', percentual: 70, origem: 'nativa' }, { racaId: 'humano', percentual: 30, origem: 'adquirida' }],
    ...(vis ? { racaVisibilidade: vis } : {}),
});
let mockState;
function montar({ isMestre, vis }) {
    mockState = {
        minhaFicha: { bio: bioCom(vis), poderes: PODERES() },
        meuNome: 'Kai', isMestre, cenario: CENARIO, pedirSecaoMestre: vi.fn(), adicionarAviso: vi.fn(),
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.getState = () => mockState;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    const r = render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
    fireEvent.click(screen.getByRole('tab', { name: /Habilidades de Raça/ }));
    return r;
}
function despejo() {
    const partes = [document.body.innerHTML, document.body.textContent];
    document.body.querySelectorAll('input,select,textarea').forEach((el) => partes.push(`[value=${el.value}]`));
    return partes.join('\n');
}
const RE_RACA = /Saiyajin|Sayajin/gi;
const RE_DOMINIO = /(?<![\d.,])70(?:\.0+)?\s*%|Dom[ií]nio\D{0,25}\b70\b|\[value=70\]|\(70%/gi;

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('Grimório: Habilidades de Raça não vazam a Raça oculta', () => {
    it('dono jogador, Raça SECRETA: nem nome, nem apelido, nem Domínio 70 em lugar nenhum', () => {
        montar({ isMestre: false, vis: { saiyajin: 'secreta' } });
        const txt = despejo();
        expect(txt.match(RE_RACA) || []).toEqual([]);
        expect(txt.match(RE_DOMINIO) || []).toEqual([]);
        expect(txt).toMatch(/Zenkai/);
        expect(txt).toMatch(/Raça desconhecida/);
        // A mecânica usa o dado real: 70 < 80 => continua bloqueada (botão desabilitado), com selo genérico.
        expect(screen.getAllByRole('button', { name: /Desativada/ })[0].disabled).toBe(true);
        expect(window.alert).not.toHaveBeenCalled();
    });
    it('dono jogador, Raça PRIVADA: vê tudo (nome e Domínio)', () => {
        montar({ isMestre: false, vis: { saiyajin: 'privada' } });
        const txt = despejo();
        expect(txt).toMatch(/Saiyajin 70%/);
        expect(txt).toMatch(/Domínio: Saiyajin 70% \(mínimo 80%\)/);
    });
    it('Mestre, Raça SECRETA: vê tudo e o aviso "Raça oculta para o jogador"', () => {
        montar({ isMestre: true, vis: { saiyajin: 'secreta' } });
        const txt = despejo();
        expect(txt).toMatch(/Saiyajin 70%/);
        expect(txt).toMatch(/Raça oculta para o jogador/);
    });
    it('sem racaVisibilidade: igual ao comportamento antigo (tudo visível, sem avisos de oculta)', () => {
        montar({ isMestre: false, vis: null });
        const txt = despejo();
        expect(txt).toMatch(/Saiyajin 70%.*Humano 30%/s);
        expect(txt).not.toMatch(/Raça desconhecida|Raça oculta/);
    });
    it('Mestre sem nada oculto não vê o aviso de Raça oculta', () => {
        montar({ isMestre: true, vis: { humano: 'privada' } });
        expect(despejo()).not.toMatch(/Raça oculta para o jogador/);
    });
    it('Raça secreta é só a Humano (a Saiyajin pública): Saiyajin aparece, Humano e 30% não', () => {
        montar({ isMestre: false, vis: { humano: 'secreta' } });
        const txt = despejo();
        expect(txt).toMatch(/Saiyajin/);
        expect(txt.match(/Humano|(?<![\d.,])30\s*%/g) || []).toEqual([]);
    });
});
