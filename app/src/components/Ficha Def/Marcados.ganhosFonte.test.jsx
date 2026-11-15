import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

// Linha "Ganhos permanentes": detalhamento por fonte, historico recolhivel e correcao do Mestre (Remover ganho de <fonte>).
function ficha(overrides = {}) {
    return {
        vida: { base: 600 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 0 },
        destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 },
        stamina: { base: 0 }, constituicao: { base: 0 }, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], seresSelados: [],
        ...overrides,
    };
}
function montar(f, extra = {}) {
    const estado = {
        minhaFicha: f, updateFicha: vi.fn((cb) => cb(f)), meuNome: 'Testador', importarDaAbaStatus: vi.fn(),
        isMestre: false, divisorPoderMesa: 1, setDivisorPoderMesa: vi.fn(), ...extra,
    };
    useStore.mockImplementation((sel) => (sel ? sel(estado) : estado));
    return estado;
}
const ganhos = () => ({
    poderCalculado: 0.2,
    porFonte: { adaptacao: 0.1, zenkai: 0.03, gatilhos: 0 },
    historico: [
        { ts: 1700000000000, fonte: 'adaptacao', pct: 10, decisao: 'liberado', cena: 'Arena', rodada: 4 },
        { ts: 1700000100000, fonte: 'zenkai', pct: 3, decisao: 'liberado', cena: 'Arena' },
    ],
});

beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); });
afterEach(cleanup);

describe('Marcados: ganhos permanentes por fonte', () => {
    it('mostra o detalhamento: Adaptacao, Zenkai e Outros (a diferenca sem fonte); fonte zerada nao aparece', () => {
        montar(ficha({ ganhosPermanentes: ganhos() }));
        render(<MarcadosPanel />);
        expect(screen.getByTestId('ganho-fonte-adaptacao').textContent).toContain('Adaptação +10%');
        expect(screen.getByTestId('ganho-fonte-zenkai').textContent).toContain('Zenkai +3%');
        expect(screen.queryByTestId('ganho-fonte-gatilhos')).toBeNull();
        expect(screen.getByTestId('ganho-fonte-outros').textContent).toContain('+7%'); // 20% - 13%
    });
    it('ficha antiga (sem porFonte): tudo aparece como Outros/anteriores', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 0.5 } }));
        render(<MarcadosPanel />);
        expect(screen.getByTestId('ganho-fonte-outros').textContent).toContain('Outros/anteriores +50%');
        expect(screen.queryByTestId('ganho-fonte-adaptacao')).toBeNull();
        expect(screen.queryByTestId('ganho-historico')).toBeNull();
    });
    it('Gatilhos mostra o fator multiplicativo na mesma linha', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 0.1, fatorPoder: 1.5, porFonte: { gatilhos: 0.1 } } }));
        render(<MarcadosPanel />);
        expect(screen.getByTestId('ganho-fonte-gatilhos').textContent).toContain('Gatilhos +10% (fator ×1,5)');
    });
    it('so fator (sem soma): Gatilhos aparece com +0% e o fator', () => {
        montar(ficha({ ganhosPermanentes: { fatorPoder: 2 } }));
        render(<MarcadosPanel />);
        expect(screen.getByTestId('ganho-fonte-gatilhos').textContent).toContain('fator ×2');
    });
    it('Historico recolhivel: data, fonte, valor, decisao, cena e rodada; mais novo primeiro', () => {
        montar(ficha({ ganhosPermanentes: ganhos() }));
        render(<MarcadosPanel />);
        const det = screen.getByTestId('ganho-historico');
        expect(det.tagName).toBe('DETAILS');
        expect(det.open).toBe(false);
        const itens = det.querySelectorAll('li');
        expect(itens).toHaveLength(2);
        expect(itens[0].textContent).toMatch(/Zenkai · \+3% · liberado · Arena/);
        expect(itens[1].textContent).toMatch(/Adaptação · \+10% · liberado · Arena \(rodada 4\)/);
    });
    it('jogador (nao Mestre): nenhum botao de remover', () => {
        montar(ficha({ ganhosPermanentes: ganhos() }));
        render(<MarcadosPanel />);
        expect(screen.queryByRole('button', { name: /Remover ganho de/ })).toBeNull();
    });
    it('Mestre: Remover ganho de Zenkai pede confirmacao, subtrai do total, zera a fonte e registra "removido"', () => {
        const f = ficha({ ganhosPermanentes: ganhos() });
        montar(f, { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'Remover ganho de Zenkai' }));
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.17, 9);
        expect(f.ganhosPermanentes.porFonte.zenkai).toBe(0);
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBe(0.1);
        const ultimo = f.ganhosPermanentes.historico[f.ganhosPermanentes.historico.length - 1];
        expect(ultimo).toMatchObject({ fonte: 'zenkai', decisao: 'removido', pct: 3 });
    });
    it('Mestre cancelando a confirmacao: nada muda', () => {
        window.confirm = vi.fn(() => false);
        const f = ficha({ ganhosPermanentes: ganhos() });
        montar(f, { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'Remover ganho de Adaptação' }));
        expect(f.ganhosPermanentes.poderCalculado).toBe(0.2);
        expect(f.ganhosPermanentes.porFonte.adaptacao).toBe(0.1);
        expect(f.ganhosPermanentes.historico).toHaveLength(2);
    });
    it('ts invalido no historico mostra "—" (nunca "Invalid Date") e registro com fonte invalida some', () => {
        const g = ganhos();
        g.historico = [{ ts: 'lixo', fonte: 'zenkai', pct: 3, decisao: 'liberado' }, { ts: 1, fonte: 'x', pct: 1, decisao: 'liberado' }];
        montar(ficha({ ganhosPermanentes: g }));
        render(<MarcadosPanel />);
        const itens = screen.getByTestId('ganho-historico').querySelectorAll('li');
        expect(itens).toHaveLength(1);
        expect(itens[0].textContent).toMatch(/^— · Zenkai/);
        expect(itens[0].textContent).not.toMatch(/Invalid/);
    });
    it('aviso discreto quando a soma das fontes passa do total (total editado a mao)', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 0.05, porFonte: { adaptacao: 0.3 } } }));
        render(<MarcadosPanel />);
        expect(screen.getByTestId('ganho-fontes-aviso').textContent).toMatch(/editado manualmente abaixo da soma das fontes/);
    });
    it('sem excesso: sem aviso', () => {
        montar(ficha({ ganhosPermanentes: ganhos() }));
        render(<MarcadosPanel />);
        expect(screen.queryByTestId('ganho-fontes-aviso')).toBeNull();
    });
    it('Mestre: fonte sem ganho nao ganha botao', () => {
        montar(ficha({ ganhosPermanentes: ganhos() }), { isMestre: true });
        render(<MarcadosPanel />);
        expect(screen.queryByRole('button', { name: 'Remover ganho de Gatilhos' })).toBeNull();
        expect(screen.getAllByRole('button', { name: /Remover ganho de/ })).toHaveLength(2);
    });
});
