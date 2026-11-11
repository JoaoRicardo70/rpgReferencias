import React, { useState } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import GatilhosEditor from './GatilhosEditor';

let ultima;
const CONTADORES = [{ id: 'dano', nome: 'Dano acumulado' }, { id: 'furia', nome: 'Furia' }];
function Host({ inicial = [] }) {
    const [lista, setLista] = useState(inicial);
    ultima = lista;
    return <GatilhosEditor gatilhos={lista} onChange={setLista} contadores={CONTADORES} poderes={[]} />;
}
afterEach(() => cleanup());
const clicar = (nome) => fireEvent.click(screen.getByText(nome));
const mudar = (rotulo, valor) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const abrir = (evento) => { render(<Host />); clicar('+ Novo gatilho'); mudar('Nome do gatilho', 'G'); mudar('Evento do gatilho', evento); mudar('Tipo da ação', 'ganhoPermanente'); };

describe('GatilhosEditor: ação ganhoPermanente', () => {
    it('a opção existe no seletor de tipo', () => {
        render(<Host />); clicar('+ Novo gatilho');
        expect(screen.getByRole('option', { name: 'Ganho permanente de Poder' })).toBeTruthy();
    });
    it('modo valor fixo (padrão): Ego Superior +2 por acerto normal', () => {
        abrir('acertou'); mudar('Nível do golpe', 'normal');
        expect(screen.queryByLabelText('Contador do ganho permanente')).toBeNull();
        mudar('Valor do ganho permanente', '2');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima).toHaveLength(1);
        expect(ultima[0].evento).toEqual({ tipo: 'acertou', nivel: 'normal' });
        expect(ultima[0].acoes).toEqual([{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2 }]);
    });
    it('modo contador: Verg Avesta fimDeLuta, fator 0.0001, zerar', () => {
        abrir('fimDeLuta');
        mudar('Origem do ganho permanente', 'contador');
        expect(screen.queryByLabelText('Valor do ganho permanente')).toBeNull();
        mudar('Contador do ganho permanente', 'dano');
        mudar('Fator do ganho permanente', '0.0001');
        fireEvent.click(screen.getByLabelText('Zerar o contador depois'));
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].acoes).toEqual([{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', deContador: { id: 'dano', fator: 0.0001, zerar: true } }]);
    });
    it('modo contador sem zerar não grava zerar', () => {
        abrir('fimDeLuta');
        mudar('Origem do ganho permanente', 'contador');
        mudar('Contador do ganho permanente', 'furia'); mudar('Fator do ganho permanente', '2');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].acoes[0].deContador).toEqual({ id: 'furia', fator: 2 });
    });
    it('valor vazio/zero/negativo não vira ação válida: não adiciona nem salva', () => {
        for (const v of ['', '0']) { // em % o negativo passou a valer (até -99,99)
            cleanup();
            abrir('acertou');
            mudar('Valor do ganho permanente', v);
            clicar('+ Ação'); clicar('Salvar gatilho');
            expect(ultima).toHaveLength(0);
        }
    });
    it('modo contador sem escolher contador ou com fator 0 é rejeitado', () => {
        abrir('fimDeLuta');
        mudar('Origem do ganho permanente', 'contador');
        mudar('Fator do ganho permanente', '1');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima).toHaveLength(0);
        cleanup();
        abrir('fimDeLuta');
        mudar('Origem do ganho permanente', 'contador');
        mudar('Contador do ganho permanente', 'dano'); mudar('Fator do ganho permanente', '0');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima).toHaveLength(0);
    });
    it('trocar o tipo reseta os campos de ganho (volta ao modo fixo)', () => {
        abrir('fimDeLuta');
        mudar('Origem do ganho permanente', 'contador');
        mudar('Tipo da ação', 'mensagem'); mudar('Tipo da ação', 'ganhoPermanente');
        expect(screen.getByLabelText('Origem do ganho permanente').value).toBe('fixo');
    });
    it('a lista mostra a frase descritiva do gatilho salvo', () => {
        abrir('acertou'); mudar('Valor do ganho permanente', '3');
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(screen.getByText(/\+3% de Poder \(soma\)/)).toBeTruthy();
    });
    it('dentro de rolarTabela aparece como opção da linha', () => {
        render(<Host />); clicar('+ Novo gatilho');
        mudar('Evento do gatilho', 'turnoInicio'); mudar('Tipo da ação', 'rolarTabela');
        const selects = screen.getAllByLabelText(/Tipo da ação/);
        expect(selects.length).toBeGreaterThan(1);
        const opts = Array.from(selects[selects.length - 1].querySelectorAll('option')).map(o => o.textContent);
        expect(opts).toContain('Ganho permanente de Poder');
    });
});

describe('GatilhosEditor: editar gatilho existente com ganhoPermanente', () => {
    it('preserva a ação ao editar só o nome', () => {
        const acoes = [{ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 0.0001, zerar: true } }, { tipo: 'ganhoPermanente', valor: 2 }];
        render(<Host inicial={[{ id: 'g1', nome: 'Verg', evento: { tipo: 'fimDeLuta' }, condicoes: [], acoes, modo: 'automatico' }]} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Verg'));
        mudar('Nome do gatilho', 'Verg 2');
        clicar('Salvar gatilho');
        expect(ultima).toHaveLength(1);
        expect(ultima[0].nome).toBe('Verg 2');
        expect(ultima[0].acoes).toEqual(acoes);
    });
});
