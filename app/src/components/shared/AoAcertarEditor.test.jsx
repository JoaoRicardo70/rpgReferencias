import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AoAcertarEditor from './AoAcertarEditor';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFichaAlvoSilencioso } from '../../services/firebase-sync';

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
}));

const minha = () => useStore.getState().minhaFicha;
const outro = () => useStore.getState().personagens.Outro;

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
        meuNome: 'Heroi',
        minhaFicha: {
            ...useStore.getState().minhaFicha,
            poderes: [{ id: 'p1', nome: 'Golpe' }],
            ataquesElementais: [{ id: 't1', nome: 'Bola', elemento: 'Fogo' }],
            inventario: [{ id: 7, nome: 'Espada', tipo: 'arma' }],
        },
        personagens: { Outro: { poderes: [{ id: 'p9', nome: 'Raio' }], ataquesElementais: [], inventario: [] } },
    });
});
afterEach(() => cleanup());

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /💚/ }));
const adicionar = () => fireEvent.click(screen.getByText('+ Ao acertar'));
const ficarEditavel = () => { render(<AoAcertarEditor colecao="poderes" itemId="p1" />); abrir(); adicionar(); };

describe('AoAcertarEditor', () => {
    it('item inexistente ou colecao inexistente -> null', () => {
        const a = render(<AoAcertarEditor colecao="poderes" itemId="nao-existe" />);
        expect(a.container.firstChild).toBeNull();
        a.unmount();
        const b = render(<AoAcertarEditor colecao="coisaNenhuma" itemId="p1" />);
        expect(b.container.firstChild).toBeNull();
    });
    it('abre e fecha', () => {
        render(<AoAcertarEditor colecao="poderes" itemId="p1" />);
        expect(document.querySelector('.descricoes-ataque-corpo')).toBeNull();
        abrir();
        expect(document.querySelector('.descricoes-ataque-corpo')).not.toBeNull();
        expect(screen.getByRole('button', { name: /💚/ }).getAttribute('aria-expanded')).toBe('true');
        abrir();
        expect(document.querySelector('.descricoes-ataque-corpo')).toBeNull();
    });
    it('+ Ao acertar grava entrada padrao normalizada e salva', () => {
        ficarEditavel();
        expect(minha().poderes[0].aoAcertar).toEqual([{ tipo: 'curarAtacante', modo: 'percMax', valor: 5 }]);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /💚/ }).textContent).toContain('(1)');
    });
    it('trocar tipo para energia mostra o seletor de energia e grava energia padrao mana', () => {
        ficarEditavel();
        expect(screen.queryByLabelText('Energia restaurada')).toBeNull();
        fireEvent.change(screen.getByLabelText('O que acontece'), { target: { value: 'energiaAtacante' } });
        expect(minha().poderes[0].aoAcertar[0]).toMatchObject({ tipo: 'energiaAtacante', energia: 'mana' });
        fireEvent.change(screen.getByLabelText('Energia restaurada'), { target: { value: 'chakra' } });
        expect(minha().poderes[0].aoAcertar[0].energia).toBe('chakra');
    });
    it('trocar modo grava o novo modo', () => {
        ficarEditavel();
        fireEvent.change(screen.getByLabelText('Como o valor é medido'), { target: { value: 'fixo' } });
        expect(minha().poderes[0].aoAcertar[0].modo).toBe('fixo');
    });
    it('so em critico liga e desliga', () => {
        ficarEditavel();
        const cb = screen.getByLabelText(/só em crítico/);
        fireEvent.click(cb);
        expect(minha().poderes[0].aoAcertar[0].apenasCritico).toBe(true);
        fireEvent.click(screen.getByLabelText(/só em crítico/));
        expect('apenasCritico' in minha().poderes[0].aoAcertar[0]).toBe(false);
    });
    it('valor: digitar so atualiza localmente e grava ao sair do campo', () => {
        ficarEditavel();
        salvarFichaSilencioso.mockClear();
        const campo = screen.getByLabelText('Valor');
        fireEvent.change(campo, { target: { value: '12' } });
        expect(minha().poderes[0].aoAcertar[0].valor).toBe(5);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        fireEvent.blur(campo);
        expect(minha().poderes[0].aoAcertar[0].valor).toBe(12);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });
    it.each([[''], ['0'], ['-1']])('digitar "%s" mantem a linha na tela e nao grava ate sair do campo', (texto) => {
        ficarEditavel();
        const campo = screen.getByLabelText('Valor');
        fireEvent.change(campo, { target: { value: texto } });
        expect(screen.getAllByLabelText('Valor')).toHaveLength(1);
        expect(minha().poderes[0].aoAcertar[0].valor).toBe(5);
    });
    it('valor vazio ou 0 ao sair do campo apaga o aoAcertar do item', () => {
        ficarEditavel();
        let campo = screen.getByLabelText('Valor');
        fireEvent.change(campo, { target: { value: '5' } });
        fireEvent.blur(campo);
        expect(minha().poderes[0].aoAcertar).toEqual([{ tipo: 'curarAtacante', modo: 'percMax', valor: 5 }]);
        fireEvent.change(campo, { target: { value: '0' } });
        fireEvent.blur(campo);
        expect('aoAcertar' in minha().poderes[0]).toBe(false);
    });
    it('valor decimal ao sair do campo vira numero', () => {
        ficarEditavel();
        const campo = screen.getByLabelText('Valor');
        fireEvent.change(campo, { target: { value: '2.5' } });
        fireEvent.blur(campo);
        expect(minha().poderes[0].aoAcertar[0].valor).toBe(2.5);
    });
    it('remover apaga a linha e o campo do item quando a lista fica vazia', () => {
        ficarEditavel();
        fireEvent.click(screen.getByLabelText('Remover efeito ao acertar'));
        expect('aoAcertar' in minha().poderes[0]).toBe(false);
        expect(screen.queryByLabelText('Valor')).toBeNull();
    });
    it('limite de 6 esconde o botao e remover o devolve', () => {
        render(<AoAcertarEditor colecao="poderes" itemId="p1" />);
        abrir();
        for (let i = 0; i < 6; i++) adicionar();
        expect(minha().poderes[0].aoAcertar).toHaveLength(6);
        expect(screen.queryByText('+ Ao acertar')).toBeNull();
        fireEvent.click(screen.getAllByLabelText('Remover efeito ao acertar')[0]);
        expect(minha().poderes[0].aoAcertar).toHaveLength(5);
        expect(screen.queryByText('+ Ao acertar')).not.toBeNull();
    });
    it('mostra o que ja existe no item', () => {
        useStore.setState({ minhaFicha: { ...minha(), poderes: [{ id: 'p1', nome: 'Golpe', aoAcertar: [{ tipo: 'energiaAtacante', modo: 'fixo', valor: 9, energia: 'aura' }] }] } });
        render(<AoAcertarEditor colecao="poderes" itemId="p1" />);
        expect(screen.getByRole('button', { name: /💚/ }).textContent).toContain('(1)');
        abrir();
        expect(screen.getByLabelText('Energia restaurada').value).toBe('aura');
        expect(screen.getByLabelText('Valor').value).toBe('9');
    });
    it('ressincroniza quando a ficha muda por fora', () => {
        render(<AoAcertarEditor colecao="poderes" itemId="p1" />);
        abrir();
        expect(screen.queryByLabelText('Valor')).toBeNull();
        act_setPoder([{ tipo: 'curarAtacante', modo: 'fixo', valor: 3 }]);
        expect(screen.getByLabelText('Valor').value).toBe('3');
    });
    it('funciona em ataquesElementais e inventario', () => {
        const a = render(<AoAcertarEditor colecao="ataquesElementais" itemId="t1" />);
        abrir(); adicionar();
        expect(minha().ataquesElementais[0].aoAcertar).toHaveLength(1);
        a.unmount();
        render(<AoAcertarEditor colecao="inventario" itemId={7} />);
        abrir(); adicionar();
        expect(minha().inventario[0].aoAcertar).toHaveLength(1);
    });
    it('com FichaAlvoProvider grava na ficha do outro personagem', () => {
        render(<FichaAlvoProvider nome="Outro"><AoAcertarEditor colecao="poderes" itemId="p9" /></FichaAlvoProvider>);
        abrir(); adicionar();
        expect(outro().poderes[0].aoAcertar).toHaveLength(1);
        expect(minha().poderes[0].aoAcertar).toBeUndefined();
        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('Outro');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('mirando outro personagem, item so da minha ficha -> null', () => {
        const { container } = render(<FichaAlvoProvider nome="Outro"><AoAcertarEditor colecao="poderes" itemId="p1" /></FichaAlvoProvider>);
        expect(container.firstChild).toBeNull();
    });
});

function act_setPoder(aoAcertar) {
    // atualiza a ficha fora do editor, como um sync do Firebase
    const { act } = require('@testing-library/react');
    act(() => { useStore.setState({ minhaFicha: { ...minha(), poderes: [{ id: 'p1', nome: 'Golpe', aoAcertar }] } }); });
}
