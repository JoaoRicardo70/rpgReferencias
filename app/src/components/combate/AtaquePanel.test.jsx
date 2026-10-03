import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AtaquePanel from './AtaquePanel';
import useStore from '../../stores/useStore';
import { getBuffs } from '../../core/attributes';
import { enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

vi.mock('../../stores/useStore');
// importOriginal — mantém getMaximoSemFormas real (usado internamente por core/vitals.js >
// getVitalMxDisplay, chamado por AtaqueFormContext.jsx pra evitar o vazamento de Energia da
// escala de notação na Fúria Berserker), só sobrescrevendo os 3 exports que este teste stuba.
vi.mock('../../core/attributes', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getBuffs: vi.fn(),
        getMaximo: vi.fn(() => 100),
        getEfeitosDeClasse: vi.fn(() => [])
    };
});
vi.mock('../../core/engine', () => ({
    calcularDano: vi.fn(() => ({ dano: 100, letalidade: 0, rolagem: '1d20' }))
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn()
}));

describe('AtaquePanel', () => {
    let mockAddFeedEntry;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockAddFeedEntry = vi.fn(); // Função local que NÂO deve ser chamada

        const mockState = {
            minhaFicha: { 
                ataqueConfig: { statusSelecionados: ['forca'] },
                poderes: [],
                inventario: []
            },
            meuNome: 'Herói',
            updateFicha: vi.fn(),
            setAbaAtiva: vi.fn(),
            addFeedEntry: mockAddFeedEntry,
            feedCombate: [],
            alvoSelecionado: null,
            dummies: {},
            ignorarTravaAcerto: false,
            setIgnorarTravaAcerto: vi.fn(),
        };
        useStore.mockImplementation(selector => selector ? selector(mockState) : mockState);

        getBuffs.mockReturnValue({
            mbase: 2.0, mgeral: 1.0, mformas: 1.0, mabs: 1.0, munico: []
        });
    });

    it('deve enviar para o Firebase e NÃO adicionar localmente (evitando duplicidade de eco)', () => {
        render(<AtaquePanel />);
        const btnRolar = screen.getByText(/ROLAR DANO/i);
        
        fireEvent.click(btnRolar);
        
        // Verifica se enviou para o banco de dados
        expect(enviarParaFeed).toHaveBeenCalled();
        
        // Verifica se a adição local foi bloqueada com sucesso!
        expect(mockAddFeedEntry).not.toHaveBeenCalled(); 
    });

    describe('Habilidades Ativadas e Magias Preparadas (recolhidas)', () => {
        afterEach(() => cleanup());
        const magia = { id: 'm1', nome: 'Bola de Fogo', elemento: 'Fogo', equipado: true, tipoMecanica: 'ofensiva', custoValor: 5 };
        const poder = { id: 'p1', nome: 'Golpe Solar', ativa: true, custoPercentual: 10 };
        const montar = ({ poderes = [], magias = [] } = {}) => {
            const mockState = {
                minhaFicha: {
                    ataqueConfig: { statusSelecionados: ['forca'] },
                    poderes, inventario: [], ataquesElementais: magias,
                },
                meuNome: 'Herói', updateFicha: vi.fn(), setAbaAtiva: vi.fn(), addFeedEntry: vi.fn(),
                feedCombate: [], alvoSelecionado: null, dummies: {}, ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
            };
            useStore.mockImplementation(selector => selector ? selector(mockState) : mockState);
        };
        const botao = () => screen.getByRole('button', { name: /Status das Habilidades Ativadas e Magias Preparadas/ });

        it('nao mostra os titulos das secoes com magia ofensiva equipada enquanto o toggle esta fechado', () => {
            montar({ magias: [magia] });
            render(<AtaquePanel />);
            expect(screen.queryByText('🔮 Magias Preparadas')).toBeNull();
            expect(screen.queryByText('✨ Habilidades Ativadas')).toBeNull();
            expect(screen.queryByText('Bola de Fogo')).toBeNull();
        });

        it('nao mostra o toggle nem as secoes sem poderes ativos e sem magias na ficha', () => {
            montar();
            render(<AtaquePanel />);
            expect(screen.queryByRole('button', { name: /Status das Habilidades Ativadas e Magias Preparadas/ })).toBeNull();
            expect(screen.queryByText('🔮 Magias Preparadas')).toBeNull();
            expect(screen.queryByText('✨ Habilidades Ativadas')).toBeNull();
        });

        it('ignora poderes inativos e magias nao equipadas ou de suporte (sem toggle)', () => {
            montar({
                poderes: [{ id: 'p2', nome: 'Dormindo', ativa: false }],
                magias: [{ ...magia, equipado: false }, { ...magia, id: 'm2', tipoMecanica: 'suporte' }],
            });
            render(<AtaquePanel />);
            expect(screen.queryByRole('button', { name: /Status das Habilidades/ })).toBeNull();
        });

        it('o toggle comeca fechado por padrao', () => {
            montar({ poderes: [poder], magias: [magia] });
            render(<AtaquePanel />);
            const b = botao();
            expect(b.getAttribute('aria-expanded')).toBe('false');
            expect(b.getAttribute('aria-controls')).toBe('ataque-listas-conteudo');
            expect(document.getElementById('ataque-listas-conteudo')).toBeNull();
            expect(screen.queryByText('Golpe Solar')).toBeNull();
        });

        it('mostra no rotulo a soma de poderes ativos e magias ofensivas', () => {
            montar({ poderes: [poder, { id: 'p3', nome: 'Outro', ativa: true }], magias: [magia] });
            render(<AtaquePanel />);
            expect(botao().textContent).toContain('Status das Habilidades Ativadas e Magias Preparadas (3)');
        });

        it('mostra contagem (1) com apenas uma magia ofensiva', () => {
            montar({ magias: [magia] });
            render(<AtaquePanel />);
            expect(botao().textContent).toContain('(1)');
        });

        it('mostra contagem (1) com apenas um poder ativo', () => {
            montar({ poderes: [poder] });
            render(<AtaquePanel />);
            expect(botao().textContent).toContain('(1)');
        });

        it('ao clicar abre o toggle, mostra as duas secoes e aria-expanded vira true', () => {
            montar({ poderes: [poder], magias: [magia] });
            render(<AtaquePanel />);
            fireEvent.click(botao());
            expect(botao().getAttribute('aria-expanded')).toBe('true');
            const conteudo = document.getElementById('ataque-listas-conteudo');
            expect(conteudo).not.toBeNull();
            expect(conteudo.textContent).toContain('✨ Habilidades Ativadas');
            expect(conteudo.textContent).toContain('Golpe Solar');
            expect(conteudo.textContent).toContain('🔮 Magias Preparadas');
            expect(conteudo.textContent).toContain('Bola de Fogo');
        });

        it('ao abrir com so magia, mostra Magias Preparadas e nao Habilidades Ativadas', () => {
            montar({ magias: [magia] });
            render(<AtaquePanel />);
            fireEvent.click(botao());
            expect(screen.getByText('🔮 Magias Preparadas')).toBeTruthy();
            expect(screen.queryByText('✨ Habilidades Ativadas')).toBeNull();
        });

        it('clicar de novo fecha o toggle e aria-expanded volta a false', () => {
            montar({ poderes: [poder], magias: [magia] });
            render(<AtaquePanel />);
            fireEvent.click(botao());
            fireEvent.click(botao());
            expect(botao().getAttribute('aria-expanded')).toBe('false');
            expect(document.getElementById('ataque-listas-conteudo')).toBeNull();
            expect(screen.queryByText('🔮 Magias Preparadas')).toBeNull();
        });

        it('a magia ofensiva equipada continua entrando na rolagem de dano com o toggle fechado', () => {
            montar({ magias: [magia] });
            render(<AtaquePanel />);
            fireEvent.click(screen.getByText(/ROLAR DANO/i));
            expect(calcularDano).toHaveBeenCalled();
            const args = calcularDano.mock.calls.at(-1)[0];
            expect(args.configHabilidades.some(h => h.id === 'm1' && h.nome === 'Bola de Fogo')).toBe(true);
        });

        it('a habilidade ativa e a magia equipada entram juntas na rolagem com o toggle fechado', () => {
            montar({ poderes: [poder], magias: [magia] });
            render(<AtaquePanel />);
            expect(botao().getAttribute('aria-expanded')).toBe('false');
            fireEvent.click(screen.getByText(/ROLAR DANO/i));
            const args = calcularDano.mock.calls.at(-1)[0];
            expect(args.configHabilidades.some(h => h.id === 'p1')).toBe(true);
            expect(args.configHabilidades.some(h => h.id === 'm1')).toBe(true);
            expect(botao().getAttribute('aria-expanded')).toBe('false');
        });
    });
});
