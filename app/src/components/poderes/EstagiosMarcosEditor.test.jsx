import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import EstagiosMarcosEditor from './EstagiosMarcosEditor';
import EstagioControle from './EstagioControle';
import { marcoParaRascunho } from '../../core/estagios';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// QA — EstagiosMarcosEditor.jsx: editor de "mudanças em estágios específicos" (marcos) e o texto
// "✦ Efeitos do Nº" do EstagioControle quando um marco está em vigor.
// ---------------------------------------------------------------------------

afterEach(() => cleanup());

const ATRIBUTOS = [{ label: 'Gerais', options: ['geral', 'forca'] }];
const PROPRIEDADES = ['base', 'mgeral', 'munico'];
const BASE = [{ nome: '', atributo: 'geral', propriedade: 'mgeral', valor: 10 }];

let ultimo;
function Harness({ inicial = {}, base = BASE }) {
    const [est, setEst] = useState({ habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: '', marcos: [], ...inicial });
    ultimo = est;
    return (
        <EstagiosMarcosEditor
            estagiosEditor={est}
            setEstagiosEditor={(parcial) => setEst(prev => ({ ...prev, ...parcial }))}
            efeitosBase={base}
            atributos={ATRIBUTOS}
            propriedades={PROPRIEDADES}
        />
    );
}
const marcoRasc = (estagio, efeitos, extra = {}) => ({ ...marcoParaRascunho({ estagio, efeitos }), ...extra });
const adicionar = () => fireEvent.click(screen.getByText(/Adicionar mudança em um estágio/));

describe('EstagiosMarcosEditor — adicionar', () => {
    it('sem marcos mostra só o botão de adicionar', () => {
        render(<Harness />);
        expect(screen.queryByTitle('Remover esta mudança')).toBeNull();
        expect(screen.getByText(/Adicionar mudança/)).toBeTruthy();
    });

    it('o primeiro marco nasce no 2º estágio, pré-preenchido com os efeitos do 1º', () => {
        render(<Harness />);
        adicionar();
        expect(ultimo.marcos).toHaveLength(1);
        expect(ultimo.marcos[0].estagio).toBe('2');
        expect(ultimo.marcos[0].efeitos).toHaveLength(1);
        expect(ultimo.marcos[0].efeitos[0].valor).toBe(10);
        expect(ultimo.marcos[0].chave).toBeTruthy();
    });

    it('novo marco é pré-preenchido com o que valia no estágio anterior (já escalado) e vem depois do último', () => {
        render(<Harness inicial={{ marcos: [marcoRasc('3', [{ atributo: 'geral', propriedade: 'mgeral', valor: 50 }], { crescimento: '0' })] }} />);
        adicionar();
        expect(ultimo.marcos[1].estagio).toBe('4');
        expect(ultimo.marcos[1].efeitos[0].valor).toBe(50);
    });

    it('sem efeitos base, o marco nasce com lista vazia e mostra o aviso de vazio', () => {
        render(<Harness base={[]} />);
        adicionar();
        expect(ultimo.marcos[0].efeitos).toEqual([]);
        expect(screen.getByText(/não dá bônus/)).toBeTruthy();
    });
});

describe('EstagiosMarcosEditor — editar', () => {
    function comMarco(extra = {}) {
        render(<Harness inicial={{ marcos: [marcoRasc('7', [{ nome: '', atributo: 'geral', propriedade: 'mgeral', valor: 120 }], extra)] }} />);
    }

    it('edita estágio, crescimento e fadiga', () => {
        comMarco();
        const [est, cresc, fad] = screen.getAllByRole('spinbutton');
        fireEvent.change(est, { target: { value: '8' } });
        fireEvent.change(cresc, { target: { value: '25' } });
        fireEvent.change(fad, { target: { value: '5' } });
        expect(ultimo.marcos[0]).toMatchObject({ estagio: '8', crescimento: '25', fadigaPorEstagio: '5' });
    });

    it('placeholders mostram o valor geral quando crescimento/fadiga estão vazios', () => {
        comMarco();
        expect(screen.getByPlaceholderText('igual (100)')).toBeTruthy();
        expect(screen.getByPlaceholderText('igual (2)')).toBeTruthy();
    });

    it('edita valor do efeito e marca "fixo"', () => {
        comMarco();
        fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '1.5' } });
        expect(ultimo.marcos[0].efeitos[0].valor).toBe('1.5');
        fireEvent.click(screen.getByRole('checkbox'));
        expect(ultimo.marcos[0].efeitos[0].fixo).toBe(true);
        fireEvent.click(screen.getByRole('checkbox'));
        expect(ultimo.marcos[0].efeitos[0].fixo).toBe(false);
    });

    it('troca atributo e propriedade do efeito', () => {
        comMarco();
        const [selAtr, selProp] = screen.getAllByRole('combobox');
        fireEvent.change(selAtr, { target: { value: 'forca' } });
        fireEvent.change(selProp, { target: { value: 'munico' } });
        expect(ultimo.marcos[0].efeitos[0]).toMatchObject({ atributo: 'forca', propriedade: 'munico' });
    });

    it('+ Efeito acrescenta linha vazia; ✖ do efeito remove só aquela linha', () => {
        comMarco();
        fireEvent.click(screen.getByText('+ Efeito'));
        expect(ultimo.marcos[0].efeitos).toHaveLength(2);
        expect(ultimo.marcos[0].efeitos[1].valor).toBe('');
        fireEvent.click(screen.getAllByTitle('Remover efeito')[0]);
        expect(ultimo.marcos[0].efeitos).toHaveLength(1);
        expect(ultimo.marcos[0].efeitos[0].valor).toBe('');
    });

    it('✖ do marco remove a mudança inteira', () => {
        comMarco();
        fireEvent.click(screen.getByTitle('Remover esta mudança'));
        expect(ultimo.marcos).toEqual([]);
    });
});

describe('EstagiosMarcosEditor — copiar do estágio anterior', () => {
    it('copia os efeitos escalados do estágio anterior', () => {
        render(<Harness inicial={{ marcos: [marcoRasc('4', [{ atributo: 'forca', propriedade: 'base', valor: 1 }])] }} />);
        fireEvent.click(screen.getByText(/Copiar do estágio anterior/));
        // 3º estágio sem este marco: mgeral 10 x 3
        expect(ultimo.marcos[0].efeitos).toHaveLength(1);
        expect(ultimo.marcos[0].efeitos[0]).toMatchObject({ propriedade: 'mgeral', valor: 30 });
    });

    it('ignora o próprio marco (não copia dele mesmo) e usa o marco anterior', () => {
        render(<Harness inicial={{ marcos: [
            marcoRasc('3', [{ atributo: 'geral', propriedade: 'mgeral', valor: 100 }]),
            marcoRasc('5', [{ atributo: 'forca', propriedade: 'base', valor: 1 }]),
        ] }} />);
        fireEvent.click(screen.getAllByText(/Copiar do estágio anterior/)[1]);
        // 4º = marco 3 (100) x (1 + 1x100%) = 200
        expect(ultimo.marcos[1].efeitos).toHaveLength(1);
        expect(ultimo.marcos[1].efeitos[0].valor).toBe(200);
    });

    it('estágio inválido ou menor que 2: não faz nada', () => {
        render(<Harness inicial={{ marcos: [marcoRasc('1', [{ atributo: 'forca', propriedade: 'base', valor: 1 }])] }} />);
        fireEvent.click(screen.getByText(/Copiar do estágio anterior/));
        expect(ultimo.marcos[0].efeitos[0].propriedade).toBe('base');
    });
});

describe('EstagiosMarcosEditor — avisos', () => {
    it('aviso para estágio menor que 2', () => {
        render(<Harness inicial={{ marcos: [marcoRasc('1', [])] }} />);
        expect(screen.getByText(/Use o 2º estágio ou acima/)).toBeTruthy();
    });
    it('aviso para estágio vazio/inválido', () => {
        render(<Harness inicial={{ marcos: [marcoRasc('', [])] }} />);
        expect(screen.getByText(/Use o 2º estágio ou acima/)).toBeTruthy();
    });
    it('aviso acima do último estágio', () => {
        render(<Harness inicial={{ maximo: 10, marcos: [marcoRasc('11', [])] }} />);
        expect(screen.getByText(/Acima do último estágio \(10º\)/)).toBeTruthy();
    });
    it('sem teto (maximo 0) não avisa por estágio alto', () => {
        render(<Harness inicial={{ maximo: 0, marcos: [marcoRasc('500', [])] }} />);
        expect(screen.queryByText(/Acima do último/)).toBeNull();
    });
    it('duplicado: avisa só na(s) anterior(es), a última vale', () => {
        render(<Harness inicial={{ marcos: [marcoRasc('5', []), marcoRasc('5', [])] }} />);
        expect(screen.getAllByText(/só a última vale/)).toHaveLength(1);
    });
    it('marco válido não mostra aviso', () => {
        render(<Harness inicial={{ marcos: [marcoRasc('7', [])] }} />);
        expect(screen.queryByText(/⚠️/)).toBeNull();
    });
});

describe('EstagioControle — marco em vigor', () => {
    function poder(estagioAtual, marcos) {
        return {
            id: 'p', nome: 'Portões', ativa: false, estagioAtual,
            estagios: { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Portão', nomes: [], marcos },
        };
    }
    const marcos = [{ estagio: 7, efeitos: [], crescimento: 0 }];

    it('antes do marco mostra "Efeitos x6"', () => {
        render(<EstagioControle poder={poder(6, marcos)} onMudar={vi.fn()} />);
        expect(screen.getByText(/Efeitos x6 /)).toBeTruthy();
        expect(screen.queryByText(/✦/)).toBeNull();
    });

    it('no marco mostra "✦ Efeitos do 7º x1" e a fadiga absoluta (14%)', () => {
        render(<EstagioControle poder={poder(7, marcos)} onMudar={vi.fn()} />);
        const el = screen.getByText(/✦ Efeitos do 7º x1/);
        expect(el.textContent).toContain('14% Fadiga/turno');
    });

    it('sem marcos nunca mostra ✦', () => {
        render(<EstagioControle poder={poder(9, undefined)} onMudar={vi.fn()} />);
        expect(screen.queryByText(/✦/)).toBeNull();
    });
});
