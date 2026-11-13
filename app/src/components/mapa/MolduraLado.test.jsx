import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import MolduraLado from './MolduraLado';
import CombateEstadoBarra from './CombateEstadoBarra';
import SeloEquipe from '../shared/SeloEquipe';
import { EQUIPES_PADRAO } from '../../core/lados';
import { useMapaForm } from './MapaFormContext';

vi.mock('./MapaFormContext', () => ({ useMapaForm: vi.fn() }));

const definirEquipeDe = vi.fn();
const alternarLadoOculto = vi.fn();
const ficha = (extra = {}) => ({ combate: { ...extra } });
const ent = { id: 'Kai', nome: 'Kai', isDummie: false };

function usarCtx(extra = {}) {
    useMapaForm.mockReturnValue({ cenario: {}, isMestre: false, equipes: EQUIPES_PADRAO, definirEquipeDe, alternarLadoOculto, ...extra });
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('MolduraLado', () => {
    it('jogador vê o lado quando visível e NENHUM controle', () => {
        usarCtx();
        render(<MolduraLado entidade={ent} ficha={ficha({ equipe: 'aliados' })} />);
        expect(screen.getByText(/Aliados/)).toBeDefined();
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByLabelText(/Equipe de Kai/)).toBeNull();
    });

    it('jogador vê "Lado desconhecido" quando oculto (sem revelar a equipe)', () => {
        usarCtx();
        const { container } = render(<MolduraLado entidade={ent} ficha={ficha({ equipe: 'inimigos', ladoOculto: true })} />);
        expect(container.textContent).toContain('❓ Lado desconhecido');
        expect(container.textContent).not.toContain('Inimigos');
    });

    it('Mestre: botão "Revelar lado" aparece com lado oculto e chama alternarLadoOculto', () => {
        usarCtx({ isMestre: true });
        render(<MolduraLado entidade={ent} ficha={ficha({ equipe: 'inimigos', ladoOculto: true })} />);
        expect(screen.getByText('🙈 Oculto')).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: /Revelar lado/ }));
        expect(alternarLadoOculto).toHaveBeenCalledWith(ent);
    });

    it('Mestre: com lado revelado o botão vira "Ocultar lado"', () => {
        usarCtx({ isMestre: true });
        render(<MolduraLado entidade={ent} ficha={ficha({ equipe: 'aliados' })} />);
        expect(screen.getByText('👁️ Revelado')).toBeDefined();
        expect(screen.getByRole('button', { name: /Ocultar lado/ })).toBeDefined();
    });

    it('Mestre: seletor de equipe chama definirEquipeDe; funciona também para Dummie', () => {
        usarCtx({ isMestre: true });
        const dummie = { id: 'd1', nome: 'Slime', isDummie: true };
        render(<MolduraLado entidade={dummie} ficha={{ nome: 'Slime' }} />);
        const select = screen.getByLabelText('Equipe de Slime');
        expect(select.value).toBe('inimigos');
        fireEvent.change(select, { target: { value: 'neutros' } });
        expect(definirEquipeDe).toHaveBeenCalledWith(dummie, 'neutros');
    });

    it('não renderiza sem contexto', () => {
        useMapaForm.mockReturnValue(null);
        const { container } = render(<MolduraLado entidade={ent} ficha={ficha()} />);
        expect(container.innerHTML).toBe('');
    });
});

describe('CombateEstadoBarra', () => {
    it('Preparação: mostra o estado e "Iniciar combate" só para o Mestre', () => {
        const onIniciar = vi.fn();
        const { rerender } = render(<CombateEstadoBarra combateAtivo={false} rodadaAtual={0} isMestre onIniciar={onIniciar} />);
        expect(screen.getByRole('status').textContent).toBe('🕊️ Preparação');
        fireEvent.click(screen.getByRole('button', { name: /Iniciar combate/ }));
        expect(onIniciar).toHaveBeenCalled();
        rerender(<CombateEstadoBarra combateAtivo={false} rodadaAtual={0} isMestre={false} onIniciar={onIniciar} />);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('Iniciar fica desabilitado sem ninguém na ordem', () => {
        render(<CombateEstadoBarra combateAtivo={false} isMestre podeIniciar={false} />);
        expect(screen.getByRole('button', { name: /Iniciar combate/ }).disabled).toBe(true);
    });

    it('Combate ativo: "Rodada N" e botão Encerrar combate', () => {
        const onEncerrar = vi.fn();
        render(<CombateEstadoBarra combateAtivo rodadaAtual={3} isMestre onEncerrar={onEncerrar} />);
        expect(screen.getByRole('status').textContent).toBe('⚔️ Combate · Rodada 3');
        fireEvent.click(screen.getByRole('button', { name: /Encerrar combate/ }));
        expect(onEncerrar).toHaveBeenCalled();
    });

    it('aviso de combate sem início só para o Mestre', () => {
        const { rerender } = render(<CombateEstadoBarra combateAtivo={false} combateSemInicio isMestre />);
        expect(screen.getByText(/combate não foi iniciado/)).toBeDefined();
        rerender(<CombateEstadoBarra combateAtivo={false} combateSemInicio isMestre={false} />);
        expect(screen.queryByText(/combate não foi iniciado/)).toBeNull();
    });
});

describe('SeloEquipe', () => {
    it('jogador: lado oculto vira ❓; lado visível mostra o ícone da equipe', () => {
        const oculto = { ficha: { combate: { equipe: 'inimigos', ladoOculto: true } }, isDummie: false };
        const { rerender } = render(<SeloEquipe cenario={{}} entidade={oculto} isMestre={false} />);
        expect(screen.getByTestId('lado-selo').textContent).toContain('❓');
        expect(screen.getByTestId('lado-selo').getAttribute('aria-label')).toBe('❓ Lado desconhecido');
        rerender(<SeloEquipe cenario={{}} entidade={{ ficha: { combate: { equipe: 'aliados' } }, isDummie: false }} isMestre={false} />);
        expect(screen.getByTestId('lado-selo').textContent).toContain('🛡️');
    });

    it('Mestre vê a equipe real mesmo oculta, com indicação de oculto', () => {
        const oculto = { ficha: { combate: { equipe: 'inimigos', ladoOculto: true } }, isDummie: false };
        render(<SeloEquipe cenario={{}} entidade={oculto} isMestre />);
        const s = screen.getByTestId('lado-selo');
        expect(s.textContent).toContain('👹');
        expect(s.getAttribute('aria-label')).toContain('oculto');
    });
});
