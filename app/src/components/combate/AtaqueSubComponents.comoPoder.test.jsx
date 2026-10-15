import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

let ctxMock;
vi.mock('./AtaqueFormContext', () => ({
    useAtaqueForm: () => ctxMock,
    STATS_LIST: [{ value: 'forca', label: 'Forca' }],
    ENERGIA_LIST: [{ value: 'mana', label: 'Mana' }]
}));
vi.mock('./DisputaPoderResumo', () => ({ default: () => null }));

import { AtaqueHabilidadesAtivas, AtaqueMagiasPreparadas } from './AtaqueSubComponents';

const updateSkillConfig = vi.fn();
const montar = ({ conjura = true, poder, cfg, magia, magCfg } = {}) => {
    const p = poder === undefined ? { id: 'p1', nome: 'Golpe Solar', custoPercentual: 10, custoPercentualMax: 40 } : poder;
    const m = magia === undefined ? { id: 'm1', nome: 'Bola', custoValor: 5, custoValorMax: 20 } : magia;
    ctxMock = {
        poderesAtivos: p ? [p] : [], magiasOfensivas: m ? [m] : [],
        skillConfigs: {
            ...(p ? { [p.id]: { statusUsados: ['forca'], energiaCombustao: 'mana', ...cfg } } : {}),
            ...(m ? { [m.id]: { statusUsados: ['inteligencia'], energiaCombustao: 'mana', ...magCfg } } : {})
        },
        updateSkillConfig, toggleSkillStat: vi.fn(), armaEquipada: null,
        minhaFicha: { combate: conjura ? { conjuraComoPoder: true } : {} }
    };
};
const marcador = /Conjurar como Poder \(0% de energia\)/;
beforeEach(() => updateSkillConfig.mockClear());
afterEach(() => cleanup());

describe('ComoPoderControle em Habilidades Ativadas', () => {
    it('aparece com a capacidade liberada, margem max > 0 e habilidade nao vetada', () => {
        montar();
        render(<AtaqueHabilidadesAtivas />);
        expect(screen.getByLabelText(marcador)).toBeTruthy();
    });
    it('nao aparece sem a capacidade liberada', () => {
        montar({ conjura: false });
        render(<AtaqueHabilidadesAtivas />);
        expect(screen.queryByLabelText(marcador)).toBeNull();
    });
    it('nao aparece com a habilidade vetada (semComoPoder)', () => {
        montar({ poder: { id: 'p1', nome: 'X', custoPercentual: 10, custoPercentualMax: 40, semComoPoder: true } });
        render(<AtaqueHabilidadesAtivas />);
        expect(screen.queryByLabelText(marcador)).toBeNull();
    });
    it('nao aparece com margem maxima 0 (sem custo cadastrado)', () => {
        montar({ poder: { id: 'p1', nome: 'X', custoPercentual: 0 } });
        render(<AtaqueHabilidadesAtivas />);
        expect(screen.queryByLabelText(marcador)).toBeNull();
    });
    it('aparece se so o Custo minimo existe (max cai para o minimo)', () => {
        montar({ poder: { id: 'p1', nome: 'X', custoPercentual: 15 } });
        render(<AtaqueHabilidadesAtivas />);
        expect(screen.getByLabelText(marcador)).toBeTruthy();
    });
    it('marcar o checkbox chama updateSkillConfig(id, comoPoder, true)', () => {
        montar();
        render(<AtaqueHabilidadesAtivas />);
        fireEvent.click(screen.getByLabelText(marcador));
        expect(updateSkillConfig).toHaveBeenCalledWith('p1', 'comoPoder', true);
    });
    it('desmarcar chama com false', () => {
        montar({ cfg: { comoPoder: true } });
        render(<AtaqueHabilidadesAtivas />);
        fireEvent.click(screen.getByLabelText(marcador));
        expect(updateSkillConfig).toHaveBeenCalledWith('p1', 'comoPoder', false);
    });
    it('campo de percentual so aparece com comoPoder marcado e mostra a margem; padrao e o maximo', () => {
        montar();
        const { unmount } = render(<AtaqueHabilidadesAtivas />);
        expect(screen.queryByRole('spinbutton')).toBeNull();
        unmount();
        montar({ cfg: { comoPoder: true } });
        render(<AtaqueHabilidadesAtivas />);
        expect(screen.getByText(/10% a 40%/)).toBeTruthy();
        expect(screen.getByRole('spinbutton').value).toBe('40');
    });
    it('alterar o percentual chama updateSkillConfig com numero; vazio vira undefined', () => {
        montar({ cfg: { comoPoder: true, percComoPoder: 25 } });
        render(<AtaqueHabilidadesAtivas />);
        const campo = screen.getByRole('spinbutton');
        expect(campo.value).toBe('25');
        fireEvent.change(campo, { target: { value: '30' } });
        expect(updateSkillConfig).toHaveBeenCalledWith('p1', 'percComoPoder', 30);
        fireEvent.change(campo, { target: { value: '' } });
        expect(updateSkillConfig).toHaveBeenCalledWith('p1', 'percComoPoder', undefined);
    });
    it('ao sair do campo (blur) o percentual e limitado a margem', () => {
        montar({ cfg: { comoPoder: true, percComoPoder: 999 } });
        render(<AtaqueHabilidadesAtivas />);
        fireEvent.blur(screen.getByRole('spinbutton'));
        expect(updateSkillConfig).toHaveBeenCalledWith('p1', 'percComoPoder', 40);
    });
    it('blur com valor abaixo do minimo sobe para o minimo', () => {
        montar({ cfg: { comoPoder: true, percComoPoder: 1 } });
        render(<AtaqueHabilidadesAtivas />);
        fireEvent.blur(screen.getByRole('spinbutton'));
        expect(updateSkillConfig).toHaveBeenCalledWith('p1', 'percComoPoder', 10);
    });
});

describe('ComoPoderControle em Magias Preparadas', () => {
    it('aparece para magia com custoValorMax e chama updateSkillConfig com o id da magia', () => {
        montar({ poder: null });
        render(<AtaqueMagiasPreparadas />);
        fireEvent.click(screen.getByLabelText(marcador));
        expect(updateSkillConfig).toHaveBeenCalledWith('m1', 'comoPoder', true);
    });
    it('nao aparece se vetada ou sem capacidade', () => {
        montar({ poder: null, magia: { id: 'm1', nome: 'B', custoValor: 5, custoValorMax: 20, semComoPoder: true } });
        const { unmount } = render(<AtaqueMagiasPreparadas />);
        expect(screen.queryByLabelText(marcador)).toBeNull();
        unmount();
        montar({ poder: null, conjura: false });
        render(<AtaqueMagiasPreparadas />);
        expect(screen.queryByLabelText(marcador)).toBeNull();
    });
    it('percentual da magia usa a margem custoValor..custoValorMax', () => {
        montar({ poder: null, magCfg: { comoPoder: true } });
        render(<AtaqueMagiasPreparadas />);
        expect(screen.getByText(/5% a 20%/)).toBeTruthy();
        expect(screen.getByRole('spinbutton').value).toBe('20');
    });
});
