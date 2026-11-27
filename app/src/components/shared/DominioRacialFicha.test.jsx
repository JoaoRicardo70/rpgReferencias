import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import useStore from '../../stores/useStore';
import DominioRacialFicha from './DominioRacialFicha';
import SeletorRaca from './SeletorRaca';
import ComposicaoRacialFicha from './ComposicaoRacialFicha';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import { ResumoDominioRacial, DominioHabilidadeRaca } from '../poderes/RacaPoderControles';
import DisponiveisBiblioteca from '../poderes/DisponiveisBiblioteca';
import RacasAcessoCampo from '../poderes/RacasAcessoCampo';
import { VIEWER_DONO_JOGADOR, VIEWER_MESTRE } from '../../core/racasVisibilidade';
import { criarEntradaDePoder } from '../../core/bibliotecaRacial';
import { montarContextoFicha } from '../../core/sextaFeira';
import { resumoFichaDetalhado, executarFerramenta } from '../../core/sextaFeiraFerramentas';
import * as sync from '../../services/firebase-sync';

vi.mock('../../services/firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)), salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(), salvarFichaAlvoImediato: vi.fn(), salvarFirebaseImediato: vi.fn(),
}));

const RACAS = [
    { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '' },
    { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' },
];
const zenkai = { id: 7, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], percentualMinimo: 50, efeitos: [] };
const fichaCom = (vis, percentualSaiyajin = 70) => ({
    bio: { raca: 'Saiyajin', racaId: 'saiyajin', composicaoRacial: [{ racaId: 'saiyajin', percentual: percentualSaiyajin, origem: 'nativa' }, { racaId: 'humano', percentual: 30, origem: 'adquirida' }], ...(vis ? { racaVisibilidade: vis } : {}) },
    poderes: [],
});
function preparar({ isMestre = false, ficha = fichaCom(), outros = {}, extra = {} } = {}) {
    useStore.setState({ isMestre, souMestreReal: isMestre, meuNome: 'Kai', cenario: { racas: RACAS }, minhaFicha: ficha, personagens: outros, ...extra });
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, cenario: {}, personagens: {} }); });

describe('Ficha Definitiva: Composição Racial e Domínio (jogador)', () => {
    it('mostra as Raças públicas com Domínio, origem e seletor Pública/Privada, sem campos editáveis de percentual', () => {
        preparar();
        render(<DominioRacialFicha />);
        expect(screen.getByText('🧬 Composição Racial e Domínio')).toBeTruthy();
        expect(screen.getByText('Domínio 70%')).toBeTruthy();
        expect(screen.getByText('Domínio 30%')).toBeTruthy();
        expect(screen.getByText('🌱 Nativa')).toBeTruthy();
        expect(screen.queryByRole('spinbutton')).toBeNull();
        const sel = screen.getByLabelText('Visibilidade de Humano');
        expect(Array.from(sel.querySelectorAll('option')).map(o => o.value)).toEqual(['publica', 'privada']);
        fireEvent.change(sel, { target: { value: 'privada' } });
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toEqual({ humano: 'privada' });
    });

    it('Raça secreta: o dono vê "Raça desconhecida", sem nome nem percentual', () => {
        preparar({ ficha: fichaCom({ humano: 'secreta' }) });
        const { container } = render(<DominioRacialFicha />);
        expect(screen.getByText('❓ Raça desconhecida')).toBeTruthy();
        expect(container.textContent).not.toMatch(/Humano|30%/);
        expect(screen.getByText('Domínio 70%')).toBeTruthy();
    });

    it('sem nenhuma Raça visível e sem texto livre, o bloco some', () => {
        preparar({ ficha: { bio: { raca: '' }, poderes: [] } });
        const { container } = render(<DominioRacialFicha />);
        expect(container.firstChild).toBeNull();
    });

    it('Modo Jogador do Mestre vale como jogador (sem campos de edição)', () => {
        preparar({ isMestre: false, extra: { souMestreReal: true, modoJogador: true } });
        render(<DominioRacialFicha />);
        expect(screen.queryByRole('spinbutton')).toBeNull();
        expect(screen.queryByText(/Salvar composição/)).toBeNull();
    });
});

describe('Ficha Definitiva: Mestre', () => {
    it('edita percentual (ao sair do campo) e visibilidade, e revela', () => {
        preparar({ isMestre: true, ficha: fichaCom({ humano: 'secreta' }) });
        render(<DominioRacialFicha />);
        const campo = screen.getByLabelText('Percentual de Kai em Saiyajin');
        fireEvent.change(campo, { target: { value: '80' } });
        fireEvent.blur(campo);
        expect(useStore.getState().minhaFicha.bio.composicaoRacial[0].percentual).toBe(80);
        const sel = screen.getByLabelText('Visibilidade de Humano');
        expect(Array.from(sel.querySelectorAll('option')).map(o => o.value)).toEqual(['publica', 'privada', 'secreta']);
        fireEvent.click(screen.getByRole('button', { name: 'Revelar Humano' }));
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toBeUndefined();
        expect(sync.enviarParaFeed).toHaveBeenCalled();
    });

    it('na ficha de OUTRO personagem salva granular na ficha-alvo', () => {
        preparar({ isMestre: true, outros: { Vegeta: fichaCom() } });
        render(<FichaAlvoProvider nome="Vegeta"><DominioRacialFicha /></FichaAlvoProvider>);
        fireEvent.change(screen.getByLabelText('Visibilidade de Humano'), { target: { value: 'secreta' } });
        expect(sync.salvarCamposPersonagem).toHaveBeenCalledWith('Vegeta', { 'bio/racaVisibilidade/humano': 'secreta' });
    });
});

describe('Campo Raça principal oculto', () => {
    it('SeletorRaca oculta mostra "Raça desconhecida" e nenhum campo editável', () => {
        preparar();
        render(<SeletorRaca valor="Saiyajin" aoMudar={vi.fn()} oculta variante="ficha" />);
        expect(screen.getByText('❓ Raça desconhecida')).toBeTruthy();
        expect(screen.queryByRole('combobox')).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
    });
    it('ComposicaoRacialFicha mascara a principal secreta', () => {
        preparar({ ficha: fichaCom({ saiyajin: 'secreta' }) });
        const { container } = render(<ComposicaoRacialFicha />);
        expect(container.textContent).not.toMatch(/Saiyajin|70%/);
        expect(container.textContent).toMatch(/Raça desconhecida/);
    });
    it('ComposicaoRacialFicha completa para o Mestre', () => {
        preparar({ isMestre: true, ficha: fichaCom({ saiyajin: 'secreta' }) });
        const { container } = render(<ComposicaoRacialFicha />);
        expect(container.textContent).toMatch(/Saiyajin.*70%/);
    });
});

describe('Cartões do Grimório: máscaras', () => {
    const fichaBaixa = () => fichaCom({ saiyajin: 'secreta' }, 20);
    const dono = { id: 'Kai', nome: 'Kai' };

    it('jogador: resumo e Domínio sem a Raça secreta; selo genérico', () => {
        const ficha = fichaBaixa();
        const { container } = render(<><ResumoDominioRacial cenario={{ racas: RACAS }} ficha={ficha} viewer={VIEWER_DONO_JOGADOR} /><DominioHabilidadeRaca poder={zenkai} ficha={ficha} cenario={{ racas: RACAS }} entidade={dono} isMestre={false} viewer={VIEWER_DONO_JOGADOR} /></>);
        expect(container.textContent).not.toMatch(/Saiyajin|20%/);
        expect(container.textContent).toMatch(/Raça desconhecida/);
        expect(container.textContent).toMatch(/Domínio mínimo exigido: 50%/);
    });
    it('Mestre: tudo e o aviso discreto', () => {
        const ficha = fichaBaixa();
        const { container } = render(<><ResumoDominioRacial cenario={{ racas: RACAS }} ficha={ficha} viewer={VIEWER_MESTRE} /><DominioHabilidadeRaca poder={zenkai} ficha={ficha} cenario={{ racas: RACAS }} entidade={dono} isMestre viewer={VIEWER_MESTRE} /></>);
        expect(container.textContent).toMatch(/Saiyajin.*20%/);
        expect(container.textContent).toMatch(/Domínio: Saiyajin 20% \(mínimo 50%\)/);
        expect(screen.getByText('🙈 Raça oculta para o jogador')).toBeTruthy();
    });
    it('"Raças com acesso" some para o jogador e aparece para quem pode ver', () => {
        const { container, rerender } = render(<RacasAcessoCampo poder={zenkai} cenario={{ racas: RACAS }} podeEditar={false} ocultar />);
        expect(container.textContent).toBe('');
        rerender(<RacasAcessoCampo poder={zenkai} cenario={{ racas: RACAS }} podeEditar={false} />);
        expect(container.textContent).toMatch(/Saiyajin/);
    });
    it('biblioteca: entrada cujo acesso vem de Raça oculta some para o jogador e aparece para o Mestre', () => {
        const entrada = criarEntradaDePoder({ nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'] }, { resumo: 'Cresce', agora: 1 }).entrada;
        const cenario = { racas: RACAS, bibliotecaRacial: [entrada] };
        const ficha = fichaCom({ saiyajin: 'secreta' });
        const { container, rerender } = render(<DisponiveisBiblioteca cenario={cenario} ficha={ficha} entidade={dono} isMestre={false} viewer={VIEWER_DONO_JOGADOR} />);
        expect(container.textContent).not.toMatch(/Zenkai/);
        rerender(<DisponiveisBiblioteca cenario={cenario} ficha={fichaCom()} entidade={dono} isMestre={false} viewer={VIEWER_DONO_JOGADOR} />);
        expect(container.textContent).toMatch(/Zenkai/);
        rerender(<DisponiveisBiblioteca cenario={cenario} ficha={ficha} entidade={dono} isMestre viewer={VIEWER_MESTRE} />);
        expect(container.textContent).toMatch(/Zenkai/);
    });
});

describe('Sexta-Feira não vaza a Raça oculta', () => {
    const cenario = { racas: RACAS };
    const secreta = fichaCom({ saiyajin: 'secreta' });
    const privada = fichaCom({ saiyajin: 'privada' });

    it('contexto de quem fala', () => {
        expect(montarContextoFicha(secreta, 'Kai', { cenario })).not.toMatch(/Saiyajin/);
        expect(montarContextoFicha(secreta, 'Kai', { cenario })).toMatch(/Raça desconhecida/);
        expect(montarContextoFicha(secreta, 'Kai', { cenario, isMestre: true })).toMatch(/Raça: Saiyajin/);
        expect(montarContextoFicha(privada, 'Kai', { cenario })).toMatch(/Raça: Saiyajin/);
        expect(montarContextoFicha(fichaCom(), 'Kai')).toMatch(/Raça: Saiyajin/);
    });
    it('ficha detalhada do dono e consulta de outro jogador', async () => {
        expect(resumoFichaDetalhado('Kai', secreta, { cenario, meuNome: 'Kai', isMestre: false }).raca).toBe('❓ Raça desconhecida');
        expect(resumoFichaDetalhado('Kai', privada, { cenario, meuNome: 'Kai', isMestre: false }).raca).toBe('Saiyajin');
        expect(resumoFichaDetalhado('Kai', secreta, { cenario, meuNome: 'Mestre', isMestre: true }).raca).toBe('Saiyajin');
        const estado = { meuNome: 'Outro', isMestre: false, minhaFicha: fichaCom(), personagens: { Kai: privada }, cenario };
        const r = await executarFerramenta('consultar_ficha', { nome: 'Kai' }, estado);
        expect(JSON.stringify(r)).not.toMatch(/Saiyajin/);
        const publica = await executarFerramenta('consultar_ficha', { nome: 'Kai' }, { ...estado, personagens: { Kai: fichaCom() } });
        expect(JSON.stringify(publica)).toMatch(/Saiyajin/);
    });
});

describe('revisão: terceiros, principal fora da composição e defaults restritos', () => {
    it('SeletorRaca oculta sem texto (terceiro) não renderiza nada', () => {
        preparar();
        const { container } = render(<SeletorRaca valor="Saiyajin" aoMudar={vi.fn()} oculta textoOculto="" variante="ficha" />);
        expect(container.textContent).toBe('');
    });
    it('ComposicaoRacialFicha: outro jogador com Raça privada não vê nada, nem placeholder', () => {
        const alvo = fichaCom({ saiyajin: 'privada', humano: 'secreta' });
        preparar({ outros: { Vegeta: alvo } });
        const { container } = render(<FichaAlvoProvider nome="Vegeta"><ComposicaoRacialFicha /></FichaAlvoProvider>);
        expect(container.textContent).not.toMatch(/Saiyajin|Humano|desconhecida/);
    });
    it('principal catalogada fora da composição explícita ganha linha com seletor (dono e Mestre)', () => {
        const f = { bio: { raca: 'Humano', racaId: 'humano', composicaoRacial: [{ racaId: 'saiyajin', percentual: 40, origem: 'adquirida' }] }, poderes: [] };
        preparar({ ficha: f });
        const { container } = render(<DominioRacialFicha />);
        expect(container.textContent).toMatch(/Raça principal: Humano/);
        const sel = screen.getByLabelText('Visibilidade de Raça principal');
        expect(Array.from(sel.querySelectorAll('option')).map(o => o.value)).toEqual(['publica', 'privada']);
        fireEvent.change(sel, { target: { value: 'privada' } });
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toEqual({ humano: 'privada' });
        cleanup();
        preparar({ isMestre: true, ficha: f });
        render(<DominioRacialFicha />);
        const selM = screen.getByLabelText('Visibilidade de Raça principal');
        expect(Array.from(selM.querySelectorAll('option')).map(o => o.value)).toEqual(['publica', 'privada', 'secreta']);
    });
    it('sem viewer, os componentes de cartão são fail-closed (nada da Raça secreta)', () => {
        const ficha = fichaCom({ saiyajin: 'secreta' }, 20);
        const { container } = render(<><ResumoDominioRacial cenario={{ racas: RACAS }} ficha={ficha} /><DominioHabilidadeRaca poder={zenkai} ficha={ficha} cenario={{ racas: RACAS }} entidade={{ id: 'Kai', nome: 'Kai' }} isMestre={false} /></>);
        expect(container.textContent).not.toMatch(/Saiyajin|20%/);
    });
    it('alert de bloqueio ao jogador não cita Raça nem percentual; Mestre vê completo', async () => {
        const { poderBloqueadoParaDono } = await import('../../core/racasVisibilidade');
        const ficha = fichaCom({ saiyajin: 'secreta' }, 20);
        const cen = { racas: RACAS };
        expect(poderBloqueadoParaDono(cen, ficha, zenkai, false).motivo).not.toMatch(/Saiyajin|20%|50%/);
        expect(poderBloqueadoParaDono(cen, ficha, zenkai, true).motivo).toMatch(/Saiyajin em 20%/);
    });
});
