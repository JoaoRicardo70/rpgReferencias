import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtalhoAtaques } from './MapaCombate';
import useStore from '../../stores/useStore';

// QA - Livro de Combate: abas Arma e Defesas, e a cobranca de Acao ao ligar tecnicas (MapaTecnicasRapidas).
let ataqueCtx;
let poderesCtx;
let elemCtx;
let arsenalCtx;
let fichaAtiva;
const updateFicha = vi.fn((cb) => cb(fichaAtiva));
const salvar = vi.fn();
const gastarAcao = vi.fn(() => true);

vi.mock('../combate/AtaqueFormContext', () => ({ useAtaqueForm: () => ataqueCtx }));
vi.mock('../poderes/PoderesFormContext', () => ({ usePoderesForm: () => poderesCtx }));
vi.mock('../arsenal/ElementosFormContext', () => ({ useElementosForm: () => elemCtx, emogis: {}, cores: {} }));
vi.mock('../arsenal/ArsenalFormContext', () => ({ useArsenalForm: () => arsenalCtx }));
vi.mock('./MapaFormContext', () => ({ useMapaForm: () => null, urlSeguraParaCss: (u) => u, calcularCA: () => 10 }));
vi.mock('../Ficha Def/FichaAlvoContext', () => ({
    useFichaAtiva: () => ({ ficha: fichaAtiva, updateFicha }),
    useCallSaveAtivo: () => salvar
}));
vi.mock('../../hooks/useGastarAcao', () => ({ default: () => gastarAcao }));
vi.mock('../../stores/useStore');

const REDUCOES = [
    { id: 'r1', nome: 'Pele de Aço', tipo: 'passiva', percentual: 20, elementos: ['todos'] },
    { id: 'r2', nome: 'Escudo de Fogo', tipo: 'ativa', ativa: false, percentual: 50, elementos: ['Fogo'], tipoAcao: 'reacao', descricao: 'bloqueia' },
    { id: 'r3', nome: 'Barreira Yang', tipo: 'ativa', ativa: true, percentual: 30, elementos: ['pol:yang'] }
];
const ARMAS = [
    { id: 'a1', nome: 'Katana', tipo: 'arma', equipado: true },
    { id: 'a2', nome: 'Adaga', tipo: 'arma', equipado: false },
    { id: 'i1', nome: 'Pocao', tipo: 'consumivel' }
];
const SALVO = { id: 1, nome: 'Combo', config: { armaStatusUsados: ['forca'], poderesIds: [], magiasIds: [] } };

let rolarDano; let setIgnorarTravaAcerto; let toggleEquiparItem; let togglePoder;

function montar({ ficha = {}, ataque = {}, comArsenal = true, salvos = [] } = {}) {
    fichaAtiva = {
        poderes: [], ataquesElementais: [], inventario: ARMAS, reducoesDano: [],
        ataqueConfig: { ataquesSalvos: salvos }, ...ficha
    };
    fichaAtiva = JSON.parse(JSON.stringify(fichaAtiva)); // evita que um teste mute as fixtures do outro
    ataqueCtx = {
        minhaFicha: fichaAtiva, podeRolarDano: true, ignorarTravaAcerto: false, dummieAlvo: null,
        poderesAtivos: [], magiasOfensivas: [], armaEquipada: ARMAS[0],
        rolarAtaqueSalvo: vi.fn(), rolarDanoCustomizado: vi.fn(), rolarDano, setIgnorarTravaAcerto, ...ataque
    };
    poderesCtx = { minhaFicha: fichaAtiva, togglePoder, mudarEstagioPoder: vi.fn() };
    elemCtx = null;
    arsenalCtx = comArsenal ? { toggleEquiparItem } : null;
    return render(<MapaAtalhoAtaques />);
}
const abrir = () => fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
const abas = () => screen.queryAllByRole('tab');
const aba = (txt) => abas().find(a => a.textContent.includes(txt));
const fundo = () => document.querySelector('.livro-entidade-fundo');
const corpo = () => within(document.querySelector('.livro-entidade-corpo'));

beforeEach(() => {
    vi.clearAllMocks();
    rolarDano = vi.fn(() => true); setIgnorarTravaAcerto = vi.fn(); toggleEquiparItem = vi.fn(); togglePoder = vi.fn();
    gastarAcao.mockImplementation(() => true);
    const state = { pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn() };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
});
afterEach(() => cleanup());

describe('Livro - aba Arma', () => {
    it('abre na aba Arma quando nao ha ataques salvos e mostra a arma equipada', () => {
        montar(); abrir();
        expect(aba('Arma').getAttribute('aria-selected')).toBe('true');
        expect(corpo().getByText(/Arma equipada: Katana/)).toBeTruthy();
        expect(document.querySelector('.livro-arma')).not.toBeNull();
    });

    it('lista so as armas do inventario (ignora outros tipos) com a equipada marcada', () => {
        montar(); abrir();
        const botoes = [...document.querySelectorAll('.livro-arma-lista button')];
        expect(botoes.map(b => b.textContent)).toEqual([expect.stringContaining('Katana'), expect.stringContaining('Adaga')]);
        expect(botoes[0].getAttribute('aria-pressed')).toBe('true');
        expect(botoes[0].classList.contains('mapa-tecnica-chip--ligada')).toBe(true);
        expect(botoes[1].getAttribute('aria-pressed')).toBe('false');
    });

    it('clicar numa arma chama toggleEquiparItem com o id (equipar e desequipar)', () => {
        montar(); abrir();
        fireEvent.click(corpo().getByText(/Adaga/));
        expect(toggleEquiparItem).toHaveBeenLastCalledWith('a2');
        fireEvent.click(document.querySelectorAll('.livro-arma-lista button')[0]);
        expect(toggleEquiparItem).toHaveBeenLastCalledWith('a1');
        expect(toggleEquiparItem).toHaveBeenCalledTimes(2);
    });

    it('sem contexto do Arsenal nao lista as armas', () => {
        montar({ comArsenal: false }); abrir();
        expect(document.querySelector('.livro-arma-lista')).toBeNull();
    });

    it('sem armas no inventario nao mostra lista e avisa que nao ha arma equipada', () => {
        montar({ ficha: { inventario: [] }, ataque: { armaEquipada: null } }); abrir();
        expect(document.querySelector('.livro-arma-lista')).toBeNull();
        expect(corpo().getByText(/Nenhuma arma equipada/)).toBeTruthy();
    });

    it('ROLAR DANO chama rolarDano e fecha o Livro quando a rolagem aconteceu', () => {
        montar(); abrir();
        fireEvent.click(corpo().getByText(/ROLAR DANO/));
        expect(rolarDano).toHaveBeenCalledTimes(1);
        expect(fundo()).toBeNull();
    });

    it('fecha tambem quando rolarDano devolve undefined (so false mantem aberto)', () => {
        rolarDano = vi.fn(() => undefined);
        montar({ ataque: { rolarDano } }); abrir();
        fireEvent.click(corpo().getByText(/ROLAR DANO/));
        expect(fundo()).toBeNull();
    });

    it('NAO fecha o Livro quando rolarDano devolve false (alerta ou confirm cancelado)', () => {
        rolarDano = vi.fn(() => false);
        montar({ ataque: { rolarDano } }); abrir();
        fireEvent.click(corpo().getByText(/ROLAR DANO/));
        expect(rolarDano).toHaveBeenCalledTimes(1);
        expect(fundo()).not.toBeNull();
    });

    it('com alvo o botao vira ATACAR NOME', () => {
        montar({ ataque: { dummieAlvo: { nome: 'Boneco' } } }); abrir();
        expect(corpo().getByText('⚔️ ATACAR BONECO')).toBeTruthy();
    });

    it('sem Acerto (trava) o botao fica desabilitado, mostra o aviso e nao rola', () => {
        montar({ ataque: { podeRolarDano: false, dummieAlvo: { nome: 'Boneco' } } }); abrir();
        const btn = document.querySelector('.livro-arma-rolar');
        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toContain('ACERTO NECESSÁRIO PRIMEIRO');
        expect(document.querySelector('.livro-arma-aviso')).not.toBeNull();
        fireEvent.click(btn);
        expect(rolarDano).not.toHaveBeenCalled();
        expect(fundo()).not.toBeNull();
    });

    it('"Ignorar Trava de Acerto" chama setIgnorarTravaAcerto com o novo valor', () => {
        montar({ ataque: { podeRolarDano: false } }); abrir();
        const caixa = corpo().getByLabelText(/Ignorar Trava de Acerto/);
        expect(caixa.checked).toBe(false);
        fireEvent.click(caixa);
        expect(setIgnorarTravaAcerto).toHaveBeenCalledWith(true);
    });

    it('com Ignorar Trava marcado o botao libera mesmo sem Acerto', () => {
        montar({ ataque: { podeRolarDano: false, ignorarTravaAcerto: true } }); abrir();
        const btn = document.querySelector('.livro-arma-rolar');
        expect(btn.disabled).toBe(false);
        expect(document.querySelector('.livro-arma-aviso')).toBeNull();
        fireEvent.click(btn);
        expect(rolarDano).toHaveBeenCalledTimes(1);
    });

    it('ataque salvo: o Livro so fecha se rolarAtaqueSalvo nao devolver false', () => {
        const rolarAtaqueSalvo = vi.fn(() => false);
        montar({ salvos: [SALVO], ataque: { rolarAtaqueSalvo } }); abrir();
        fireEvent.click(document.querySelector('.atalho-livro-carta'));
        expect(rolarAtaqueSalvo).toHaveBeenCalledWith(SALVO);
        expect(fundo()).not.toBeNull();
        rolarAtaqueSalvo.mockImplementation(() => true);
        fireEvent.click(document.querySelector('.atalho-livro-carta'));
        expect(fundo()).toBeNull();
    });

    it('formula salva: nao fecha se rolarDanoCustomizado devolver false', () => {
        const rolarDanoCustomizado = vi.fn(() => false);
        montar({ ataque: { rolarDanoCustomizado }, ficha: { ataqueConfig: { formulasSalvas: [{ id: 9, nome: 'F', formula: '1d6', letalidade: 0, versao: 2 }] } } });
        abrir();
        fireEvent.click(document.querySelector('.atalho-livro-carta'));
        expect(rolarDanoCustomizado).toHaveBeenCalledTimes(1);
        expect(fundo()).not.toBeNull();
    });
});

describe('Livro - aba Defesas', () => {
    const montarComDefesas = (extra) => { montar({ ficha: { reducoesDano: REDUCOES }, ...extra }); abrir(); fireEvent.click(aba('Defesas')); };

    it('so existe com Habilidades de Reducao e o contador mostra ligadas/total (passivas contam como ligadas)', () => {
        montar(); abrir();
        expect(aba('Defesas')).toBeUndefined();
        cleanup();
        montarComDefesas();
        expect(aba('Defesas').querySelector('small').textContent).toBe('★ 2/3');
    });

    it('lista passivas (so texto) e ativas (botoes) separadas', () => {
        montarComDefesas();
        const passiva = document.querySelector('.mapa-defesa-passiva');
        expect(passiva.textContent).toContain('Pele de Aço');
        expect(passiva.textContent).toContain('20%');
        expect(passiva.textContent).toContain('Todo dano');
        expect(passiva.tagName).not.toBe('BUTTON');
        expect(document.querySelectorAll('.mapa-defesa-passiva')).toHaveLength(1);
        const botoes = [...document.querySelectorAll('.livro-entidade-corpo button')];
        expect(botoes.map(b => b.textContent)).toEqual([expect.stringContaining('Escudo de Fogo'), expect.stringContaining('Barreira Yang')]);
    });

    it('chip da ativa mostra percentual, alvo e a Acao ("· Reação")', () => {
        montarComDefesas();
        const chip = corpo().getByText(/Escudo de Fogo/).closest('button');
        expect(chip.textContent).toContain('50%');
        expect(chip.textContent).toContain('Fogo');
        expect(chip.textContent).toContain('· Reação');
        const outro = corpo().getByText(/Barreira Yang/).closest('button');
        expect(outro.textContent).toContain('Elemento Yang');
        expect(outro.textContent).not.toContain('Reação');
    });

    it('estado ligado: aria-pressed e classe', () => {
        montarComDefesas();
        const desligada = corpo().getByText(/Escudo de Fogo/).closest('button');
        const ligada = corpo().getByText(/Barreira Yang/).closest('button');
        expect(desligada.getAttribute('aria-pressed')).toBe('false');
        expect(ligada.getAttribute('aria-pressed')).toBe('true');
        expect(ligada.classList.contains('mapa-tecnica-chip--ligada')).toBe(true);
    });

    it('clicar numa ativa desligada cobra a Acao (hook), liga e salva', () => {
        montarComDefesas();
        fireEvent.click(corpo().getByText(/Escudo de Fogo/));
        expect(gastarAcao).toHaveBeenCalledTimes(1);
        expect(gastarAcao.mock.calls[0][0]).toMatchObject({ id: 'r2', tipoAcao: 'reacao' });
        expect(fichaAtiva.reducoesDano[1].ativa).toBe(true);
        expect(salvar).toHaveBeenCalledTimes(1);
    });

    it('se o hook devolve false (cancelou), nao liga nem salva', () => {
        gastarAcao.mockImplementation(() => false);
        montarComDefesas();
        fireEvent.click(corpo().getByText(/Escudo de Fogo/));
        expect(fichaAtiva.reducoesDano[1].ativa).toBe(false);
        expect(salvar).not.toHaveBeenCalled();
    });

    it('clicar numa ativa ligada desliga sem cobrar Acao', () => {
        montarComDefesas();
        fireEvent.click(corpo().getByText(/Barreira Yang/));
        expect(gastarAcao).not.toHaveBeenCalled();
        expect(fichaAtiva.reducoesDano[2].ativa).toBe(false);
        expect(salvar).toHaveBeenCalledTimes(1);
    });

    it('ativa sem campo "ativa" conta como ligada (clicar desliga)', () => {
        montar({ ficha: { reducoesDano: [{ id: 'x', nome: 'Sem Campo', tipo: 'ativa', percentual: 5 }] } });
        abrir(); fireEvent.click(aba('Defesas'));
        fireEvent.click(corpo().getByText(/Sem Campo/));
        expect(gastarAcao).not.toHaveBeenCalled();
        expect(fichaAtiva.reducoesDano[0].ativa).toBe(false);
    });

    it('so passivas: nao ha botoes de liga/desliga', () => {
        montar({ ficha: { reducoesDano: [REDUCOES[0]] } });
        abrir(); fireEvent.click(aba('Defesas'));
        expect(document.querySelectorAll('.livro-entidade-corpo button')).toHaveLength(0);
        expect(screen.queryByText(/Ativas/)).toBeNull();
    });

    it('ignora entradas nulas na lista', () => {
        montar({ ficha: { reducoesDano: [null, REDUCOES[0]] } });
        abrir();
        expect(aba('Defesas').querySelector('small').textContent).toBe('★ 1/1');
    });
});

describe('MapaTecnicasRapidas - cobranca de Acao so ao ligar', () => {
    const PODERES = [
        { id: 'p1', nome: 'Golpe Rapido', ativa: false, categoria: 'poder', tipoAcao: 'bonus' },
        { id: 'p2', nome: 'Modo Furia', ativa: true, categoria: 'habilidade', tipoAcao: 'acao' },
        { id: 'p3', nome: 'Passiva Livre', ativa: false, categoria: 'poder' }
    ];
    const abrirTecnicas = () => { montar({ ficha: { poderes: PODERES } }); abrir(); fireEvent.click(aba('Habilidades')); };

    it('ligar uma tecnica desligada cobra a Acao e chama togglePoder', () => {
        abrirTecnicas();
        fireEvent.click(corpo().getByText(/Golpe Rapido/));
        expect(gastarAcao).toHaveBeenCalledTimes(1);
        expect(gastarAcao.mock.calls[0][0]).toMatchObject({ id: 'p1', tipoAcao: 'bonus' });
        expect(togglePoder).toHaveBeenCalledWith('p1');
    });

    it('desligar uma tecnica ligada NAO cobra Acao', () => {
        abrirTecnicas();
        fireEvent.click(corpo().getByText(/Modo Furia/));
        expect(gastarAcao).not.toHaveBeenCalled();
        expect(togglePoder).toHaveBeenCalledWith('p2');
    });

    it('se o hook devolve false, a tecnica NAO liga', () => {
        gastarAcao.mockImplementation(() => false);
        abrirTecnicas();
        fireEvent.click(corpo().getByText(/Golpe Rapido/));
        expect(gastarAcao).toHaveBeenCalledTimes(1);
        expect(togglePoder).not.toHaveBeenCalled();
    });

    it('tecnica sem tipoAcao passa pelo hook (que decide nao cobrar) e liga', () => {
        abrirTecnicas();
        fireEvent.click(corpo().getByText(/Passiva Livre/));
        expect(togglePoder).toHaveBeenCalledWith('p3');
    });

    it('o chip mostra a Acao (" · Ação Bônus") so quando tipoAcao existe', () => {
        abrirTecnicas();
        const golpe = corpo().getByText(/Golpe Rapido/).closest('button');
        expect(golpe.textContent).toContain('· Ação Bônus');
        expect(corpo().getByText(/Modo Furia/).closest('button').textContent).toContain('· Ação');
        expect(corpo().getByText(/Passiva Livre/).closest('button').querySelector('.mapa-chip-acao')).toBeNull();
    });
});
