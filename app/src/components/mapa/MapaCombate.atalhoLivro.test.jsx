import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtalhoAtaques } from './MapaCombate';

let ctx;
vi.mock('../combate/AtaqueFormContext', () => ({ useAtaqueForm: () => ctx }));
vi.mock('../../stores/useStore');
vi.mock('../poderes/PoderesFormContext', () => ({ usePoderesForm: () => null }));
vi.mock('../arsenal/ArsenalFormContext', () => ({ useArsenalForm: () => null }));
vi.mock('../arsenal/ElementosFormContext', () => ({ useElementosForm: () => null, emogis: {}, cores: {} }));
vi.mock('./MapaFormContext', () => ({ useMapaForm: () => null, urlSeguraParaCss: (u) => u, calcularCA: () => 10 }));

const FICHA_BASE = {
    poderes: [{ id: 'p1', nome: 'Golpe Rapido' }, { id: 'p2', nome: 'Escudo Etereo' }],
    ataquesElementais: [{ id: 'm1', nome: 'Bola de Fogo' }]
};
const salvoCompleto = {
    id: 1, nome: 'Combo',
    config: {
        armaStatusUsados: ['forca', 'destreza'],
        poderesIds: ['p1', 'p2'],
        magiasIds: ['m1'],
        skillConfigs: { m1: { comoPoder: true } }
    }
};

const montar = (ataqueConfig, extra = {}) => {
    ctx = {
        minhaFicha: { ...FICHA_BASE, ataqueConfig },
        podeRolarDano: true, ignorarTravaAcerto: false, dummieAlvo: null,
        poderesAtivos: [{ id: 'p1' }], magiasOfensivas: [], armaEquipada: { nome: 'Katana' },
        rolarAtaqueSalvo: vi.fn(), rolarDanoCustomizado: vi.fn(), ...extra
    };
    return render(<MapaAtalhoAtaques />);
};
const abrir = () => fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
const fundo = () => document.querySelector('.livro-entidade-fundo');

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

describe('MapaAtalhoAtaques livro - estrutura (so para usar)', () => {
    it('abre o livro com a aba Ataques Salvos e o botao FECHAR LIVRO', () => {
        montar({ ataquesSalvos: [salvoCompleto] });
        expect(fundo()).toBeNull();
        abrir();
        expect(fundo()).not.toBeNull();
        const abas = screen.getAllByRole('tab');
        expect(abas).toHaveLength(2);
        expect(abas[0].textContent).toContain('Arma');
        const aba = abas.find(a => a.textContent.includes('Ataques Salvos'));
        expect(aba).toBeTruthy();
        expect(aba.getAttribute('aria-selected')).toBe('true');
        expect(document.querySelector('.livro-entidade-barra')).not.toBeNull();
        expect(document.querySelector('.livro-entidade-corpo')).not.toBeNull();
        expect(screen.getByText(/FECHAR LIVRO/)).toBeTruthy();
    });

    it('FECHAR LIVRO fecha o livro', () => {
        montar({ ataquesSalvos: [salvoCompleto] });
        abrir();
        fireEvent.click(screen.getByText(/FECHAR LIVRO/));
        expect(fundo()).toBeNull();
        expect(screen.getByTitle('Atalho dos Ataques Salvos')).toBeTruthy();
    });

    it('nao tem input, textarea, select nem botao de criar/editar/apagar', () => {
        montar({ ataquesSalvos: [salvoCompleto], formulasSalvas: [{ id: 7, nome: 'Form1', formula: '1d6', letalidade: 0 }] });
        abrir();
        const livro = fundo();
        expect(livro.querySelectorAll('input, textarea, select').length).toBe(0);
        const textos = [...livro.querySelectorAll('button')].map(b => b.textContent);
        for (const t of textos) expect(t).not.toMatch(/criar|nova|novo|editar|apagar|excluir|salvar|deletar|🗑|✏|➕/i);
        // botoes: 2 abas (Arma e Ataques Salvos), fechar, e uma carta por ataque
        expect(livro.querySelectorAll('button').length).toBe(2 + 1 + 2);
    });

    it('usar uma carta executa e fecha o livro', () => {
        montar({ ataquesSalvos: [salvoCompleto] });
        abrir();
        fireEvent.click(document.querySelector('.atalho-livro-carta'));
        expect(ctx.rolarAtaqueSalvo).toHaveBeenCalledWith(salvoCompleto);
        expect(fundo()).toBeNull();
    });
});

describe('MapaAtalhoAtaques livro - conteudo da carta', () => {
    it('mostra a arma equipada com atributos salvos, habilidades e tecnicas pelos nomes da ficha', () => {
        montar({ ataquesSalvos: [salvoCompleto] });
        abrir();
        const carta = document.querySelector('.atalho-livro-carta');
        const txt = carta.textContent;
        expect(txt).toContain('Combo');
        expect(txt).toContain('🗡️ Katana (Força + Destreza)');
        expect(txt).toContain('✨ Golpe Rapido');
        expect(txt).toContain('✨ Escudo Etereo');
        expect(txt).toContain('🔮 Bola de Fogo');
        expect(txt).toContain('▶ USAR');
    });

    it('marca "· como Poder" e "(inativa)" so quando aplicavel', () => {
        montar({ ataquesSalvos: [salvoCompleto] });
        abrir();
        const itens = [...document.querySelectorAll('.atalho-livro-detalhes > span')].map(s => s.textContent);
        const golpe = itens.find(t => t.includes('Golpe Rapido'));
        const escudo = itens.find(t => t.includes('Escudo Etereo'));
        const bola = itens.find(t => t.includes('Bola de Fogo'));
        // p1 ativo, sem como Poder
        expect(golpe).not.toContain('(inativa)');
        expect(golpe).not.toContain('como Poder');
        // p2 inativo
        expect(escudo).toContain('(inativa)');
        expect(escudo).not.toContain('como Poder');
        // m1 inativa e como Poder
        expect(bola).toContain('· como Poder');
        expect(bola).toContain('(inativa)');
        expect(document.querySelectorAll('.atalho-livro-inativo').length).toBe(2);
    });

    it('sem arma equipada nao mostra a linha da arma; sem atributos nao mostra parenteses', () => {
        montar({ ataquesSalvos: [salvoCompleto] }, { armaEquipada: null });
        abrir();
        expect(document.querySelector('.atalho-livro-carta').textContent).not.toContain('🗡️');
        cleanup();
        montar({ ataquesSalvos: [{ id: 2, nome: 'Seco', config: { poderesIds: [], magiasIds: [] } }] });
        abrir();
        const t = document.querySelector('.atalho-livro-carta').textContent;
        expect(t).toContain('🗡️ Katana');
        expect(t).not.toContain('(');
    });

    it('item removido da ficha aparece como "Habilidade removida (inativa)"', () => {
        montar({ ataquesSalvos: [{ id: 3, nome: 'Velho', config: { poderesIds: ['zzz'], magiasIds: [] } }] });
        abrir();
        expect(document.querySelector('.atalho-livro-carta').textContent).toContain('✨ Habilidade removida (inativa)');
    });

    it('topo mostra alvo, ou "Sem alvo", e o aviso de Acerto quando travado', () => {
        montar({ ataquesSalvos: [salvoCompleto] }, { dummieAlvo: { nome: 'Boneco' } });
        abrir();
        expect(document.querySelector('.atalho-livro-topo').textContent).toContain('🎯 Boneco');
        expect(screen.queryByText(/Acerto necess/)).toBeNull();
        cleanup();
        montar({ ataquesSalvos: [salvoCompleto] }, { podeRolarDano: false });
        abrir();
        expect(document.querySelector('.atalho-livro-topo').textContent).toContain('Sem alvo');
        expect(screen.getByText(/Acerto necess/)).toBeTruthy();
        expect(document.querySelector('.atalho-livro-carta').disabled).toBe(true);
    });
});

describe('MapaAtalhoAtaques livro - clique no fundo', () => {
    it('clicar no proprio fundo vazio (.livro-entidade-fundo) fecha', () => {
        montar({ ataquesSalvos: [salvoCompleto] });
        abrir();
        fireEvent.mouseDown(fundo());
        expect(fundo()).toBeNull();
    });

    it('clicar no fundo com click completo (mousedown + click) tambem fecha', () => {
        montar({ ataquesSalvos: [salvoCompleto] });
        abrir();
        const f = fundo();
        fireEvent.mouseDown(f);
        fireEvent.mouseUp(f);
        fireEvent.click(f);
        expect(fundo()).toBeNull();
    });

    it('mousedown na barra, no corpo ou na carta NAO fecha', () => {
        montar({ ataquesSalvos: [salvoCompleto] });
        abrir();
        fireEvent.mouseDown(document.querySelector('.livro-entidade-barra'));
        fireEvent.mouseDown(document.querySelector('.livro-entidade-corpo'));
        fireEvent.mouseDown(document.querySelector('.atalho-livro-carta'));
        expect(fundo()).not.toBeNull();
    });

    it('mousedown fora do livro (document.body) fecha', () => {
        montar({ ataquesSalvos: [salvoCompleto] });
        abrir();
        fireEvent.mouseDown(document.body);
        expect(fundo()).toBeNull();
    });
});

describe('MapaAtalhoAtaques livro - ataques salvos somem', () => {
    it('quando os salvos somem o livro segue aberto na aba Arma; fecha sem contexto de ataque e NAO reaparece quando volta', () => {
        const { rerender } = montar({ ataquesSalvos: [salvoCompleto] });
        abrir();
        expect(fundo()).not.toBeNull();

        ctx = { ...ctx, minhaFicha: { ...FICHA_BASE, ataqueConfig: { ataquesSalvos: [] } } };
        rerender(<MapaAtalhoAtaques />);
        expect(fundo()).not.toBeNull();
        expect(screen.getAllByRole('tab')).toHaveLength(1);
        expect(screen.getByRole('tab').textContent).toContain('Arma');
        expect(screen.getByRole('tab').getAttribute('aria-selected')).toBe('true');

        const guardado = ctx;
        ctx = null;
        rerender(<MapaAtalhoAtaques />);
        expect(fundo()).toBeNull();
        expect(document.querySelector('.atalho-ataques')).toBeNull();

        ctx = { ...guardado, minhaFicha: { ...FICHA_BASE, ataqueConfig: { ataquesSalvos: [salvoCompleto] } } };
        rerender(<MapaAtalhoAtaques />);
        expect(fundo()).toBeNull();
        expect(screen.getByTitle('Atalho dos Ataques Salvos')).toBeTruthy();
        // e pode ser aberto de novo normalmente
        abrir();
        expect(fundo()).not.toBeNull();
    });

    it('sem nenhum ataque salvo o botao existe (aba Arma) e o livro abre so com ela', () => {
        montar({});
        expect(document.querySelector('.atalho-ataques')).not.toBeNull();
        expect(fundo()).toBeNull();
        abrir();
        expect(screen.getAllByRole('tab')).toHaveLength(1);
        expect(screen.getByRole('tab').textContent).toContain('Arma');
    });

    it('sem contexto de ataque nada e renderizado', () => {
        ctx = null;
        render(<MapaAtalhoAtaques />);
        expect(document.querySelector('.atalho-ataques')).toBeNull();
        expect(fundo()).toBeNull();
    });
});

describe('MapaAtalhoAtaques livro - formula antiga', () => {
    const antiga = { id: 9, nome: 'Velha', formula: '2d8+3', letalidade: 2, energiaTipo: 'ki', energiaCusto: 5 };

    it('mostra "Formula de texto antiga" e o aviso', () => {
        montar({ formulasSalvas: [antiga] });
        abrir();
        const carta = document.querySelector('.atalho-livro-carta');
        expect(carta.textContent).toContain('Fórmula de texto antiga');
        expect(carta.textContent).toContain('⚠️');
        expect(carta.querySelector('.atalho-ataques-antiga')).not.toBeNull();
    });

    it('formula com versao nao mostra o aviso', () => {
        montar({ formulasSalvas: [{ ...antiga, versao: 2 }] });
        abrir();
        const carta = document.querySelector('.atalho-livro-carta');
        expect(carta.textContent).not.toContain('Fórmula de texto antiga');
        expect(carta.textContent).not.toContain('⚠️');
    });

    it('executa via rolarDanoCustomizado com formula, letalidade e energia, e fecha', () => {
        montar({ formulasSalvas: [antiga] });
        abrir();
        fireEvent.click(document.querySelector('.atalho-livro-carta'));
        expect(ctx.rolarDanoCustomizado).toHaveBeenCalledTimes(1);
        expect(ctx.rolarDanoCustomizado).toHaveBeenCalledWith('2d8+3', 2, 'ki', 5);
        expect(ctx.rolarAtaqueSalvo).not.toHaveBeenCalled();
        expect(fundo()).toBeNull();
    });

    it('tecla 1 tambem executa a formula antiga', () => {
        montar({ formulasSalvas: [antiga] });
        abrir();
        fireEvent.keyDown(document, { key: '1' });
        expect(ctx.rolarDanoCustomizado).toHaveBeenCalledWith('2d8+3', 2, 'ki', 5);
    });
});
