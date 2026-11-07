import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AoAcertarEditor from './AoAcertarEditor';
import useStore from '../../stores/useStore';

// QA (endurecimento) - editor Ao acertar > "Reduz a cura do alvo": valores invalidos, limites, troca de tipo, remocao.
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()), salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(),
}));

const lista = () => useStore.getState().minhaFicha.poderes[0].aoAcertar;
const tipo = (v) => fireEvent.change(screen.getByLabelText('O que acontece'), { target: { value: v } });
const digitar = (rotulo, v) => { const c = screen.getByLabelText(rotulo); fireEvent.change(c, { target: { value: v } }); fireEvent.blur(c); };

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
        meuNome: 'Heroi',
        minhaFicha: { ...useStore.getState().minhaFicha, poderes: [{ id: 'p1', nome: 'Golpe' }], ataquesElementais: [], inventario: [] },
        personagens: {},
    });
    render(<AoAcertarEditor colecao="poderes" itemId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: /💚/ }));
    fireEvent.click(screen.getByText('+ Ao acertar'));
    tipo('reduzirCuraAlvo');
});
afterEach(() => cleanup());

describe('AoAcertarEditor - reduzirCuraAlvo (QA)', () => {
    it('mostra fator e duracao e esconde valor/modo/energia dos outros tipos', () => {
        expect(screen.getByLabelText('Fator da cura do alvo')).toBeTruthy();
        expect(screen.getByLabelText('Duração em turnos do alvo')).toBeTruthy();
        expect(screen.queryByLabelText('Valor')).toBeNull();
        expect(screen.queryByLabelText('Como o valor é medido')).toBeNull();
    });
    it('o fator exibido por padrao (0.5) e o que fica gravado depois de editar a duracao', () => {
        expect(screen.getByLabelText('Fator da cura do alvo').value).toBe('0.5');
        digitar('Duração em turnos do alvo', '3');
        expect(lista()).toEqual([expect.objectContaining({ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: 3 })]);
    });
    it('EXIBE 0.5 logo ao trocar o tipo: a ficha ja deve ter o efeito gravado com fator 0.5 (sem precisar editar)', () => {
        // Sem isto, o usuario ve "cura x 0.5 por 1 turno" mas a ficha nao tem nada ate mexer num campo.
        expect(lista()).toEqual([expect.objectContaining({ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: 1 })]);
    });
    it.each([
        ['0.33', 0.33], ['1', 1], ['0.01', 0.01],
    ])('fator %s e gravado como %s', (digitado, esperado) => {
        digitar('Fator da cura do alvo', digitado);
        expect(lista()[0].fator).toBeCloseTo(esperado, 10);
    });
    it.each([['0'], ['2'], ['-1'], ['abc'], ['']])('fator invalido "%s": o efeito NAO e gravado na ficha (nunca fator 0/NaN)', (ruim) => {
        digitar('Fator da cura do alvo', ruim);
        const l = useStore.getState().minhaFicha.poderes[0].aoAcertar;
        expect(l === undefined || l.every(x => x.fator >= 0.01 && x.fator <= 1)).toBe(true);
    });
    it('digitando (antes de sair do campo) um fator ainda incompleto a linha NAO some e nada invalido e gravado', () => {
        fireEvent.change(screen.getByLabelText('Fator da cura do alvo'), { target: { value: '' } });
        expect(screen.getByLabelText('Fator da cura do alvo')).toBeTruthy();
        const l = useStore.getState().minhaFicha.poderes[0].aoAcertar;
        expect(l.every(x => x.fator >= 0.01 && x.fator <= 1)).toBe(true);
    });
    it.each([['0', 1], ['-4', 1], ['21', 20], ['99', 20], ['2.9', 2], ['', 1]])('duracao "%s" vira %s', (digitado, esperado) => {
        digitar('Fator da cura do alvo', '0.5');
        digitar('Duração em turnos do alvo', digitado);
        expect(lista()[0].duracao).toBe(esperado);
    });
    it('marcar "so em critico" grava apenasCritico; desmarcar tira', () => {
        digitar('Fator da cura do alvo', '0.5');
        const caixa = screen.getByLabelText(/só em crítico/);
        fireEvent.click(caixa);
        expect(lista()[0].apenasCritico).toBe(true);
        fireEvent.click(caixa);
        expect(lista()[0].apenasCritico).toBeUndefined();
    });
    it('trocar para outro tipo e voltar nao deixa lixo (fator some do item gravado do outro tipo)', () => {
        digitar('Fator da cura do alvo', '0.5');
        tipo('curarAtacante');
        const item = lista()[0];
        expect(item.tipo).toBe('curarAtacante');
        expect('fator' in item).toBe(false);
    });
    it('remover o unico efeito apaga o campo aoAcertar do Poder', () => {
        digitar('Fator da cura do alvo', '0.5');
        fireEvent.click(screen.getByLabelText('Remover efeito ao acertar'));
        expect(useStore.getState().minhaFicha.poderes[0].aoAcertar).toBeUndefined();
    });
    it('dois efeitos de cura reduzida na mesma lista sao permitidos (a regra de menor fator vale na aplicacao)', () => {
        digitar('Fator da cura do alvo', '0.5');
        fireEvent.click(screen.getByText('+ Ao acertar'));
        const selects = screen.getAllByLabelText('O que acontece');
        fireEvent.change(selects[1], { target: { value: 'reduzirCuraAlvo' } });
        const fatores = screen.getAllByLabelText('Fator da cura do alvo');
        fireEvent.change(fatores[1], { target: { value: '0.2' } });
        fireEvent.blur(fatores[1]);
        expect(lista().map(x => x.fator)).toEqual([0.5, 0.2]);
    });
});
