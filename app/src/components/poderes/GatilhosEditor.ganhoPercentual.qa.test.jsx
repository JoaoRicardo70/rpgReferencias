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
const abrir = (evento = 'acertou') => { render(<Host />); clicar('+ Novo gatilho'); mudar('Nome do gatilho', 'G'); mudar('Evento do gatilho', evento); mudar('Tipo da ação', 'ganhoPermanente'); };
const salvar = () => { clicar('+ Ação'); clicar('Salvar gatilho'); };

describe('GatilhosEditor: ganho permanente em %', () => {
    it('placeholder do valor e "Valor (%)", aceita negativos (min -99.99)', () => {
        abrir();
        const campo = screen.getByLabelText('Valor do ganho permanente');
        expect(campo.placeholder).toMatch(/Valor \(%\)/);
        expect(campo.getAttribute('min')).toBe('-99.99');
    });
    it('seletor "Como aplicar" com Somar (padrao) e Multiplicar', () => {
        abrir();
        const sel = screen.getByLabelText('Como aplicar o ganho permanente');
        expect(sel.value).toBe('somar');
        expect(Array.from(sel.options).map(o => o.value)).toEqual(['somar', 'multiplicar']);
    });
    it('dica mostra 50 x 2%: soma +100% / multiplica x2,69', () => {
        abrir();
        const dica = screen.getByText(/50 acertos de \+2%/);
        expect(dica.textContent).toMatch(/\+100%/);
        expect(dica.textContent).toMatch(/2,69/);
    });
    it('valor fixo + Somar => {percentual, somar, valor}', () => {
        abrir(); mudar('Valor do ganho permanente', '2'); salvar();
        expect(ultima[0].acoes).toEqual([{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 2 }]);
    });
    it('valor fixo + Multiplicar => modo multiplicar', () => {
        abrir(); mudar('Como aplicar o ganho permanente', 'multiplicar'); mudar('Valor do ganho permanente', '2'); salvar();
        expect(ultima[0].acoes).toEqual([{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 }]);
    });
    it('valor negativo (-5) e aceito em %', () => {
        abrir(); mudar('Valor do ganho permanente', '-5'); salvar();
        expect(ultima).toHaveLength(1);
        expect(ultima[0].acoes[0].valor).toBe(-5);
    });
    it('-100 e preso a -99.99; 2000000 preso a 1e6', () => {
        abrir(); mudar('Valor do ganho permanente', '-100'); salvar();
        expect(ultima[0].acoes[0].valor).toBe(-99.99);
        cleanup();
        abrir(); mudar('Valor do ganho permanente', '2000000'); salvar();
        expect(ultima[0].acoes[0].valor).toBe(1e6);
    });
    it('0, vazio e lixo nao viram acao valida', () => {
        for (const v of ['0', '', 'abc']) {
            cleanup();
            abrir(); mudar('Valor do ganho permanente', v); salvar();
            expect(ultima).toHaveLength(0);
        }
    });
    it('contador + Multiplicar + zerar', () => {
        abrir('fimDeLuta');
        mudar('Origem do ganho permanente', 'contador');
        mudar('Como aplicar o ganho permanente', 'multiplicar');
        mudar('Contador do ganho permanente', 'dano');
        const fator = screen.getByLabelText('Fator do ganho permanente');
        expect(fator.placeholder).toMatch(/% por ponto/);
        expect(fator.getAttribute('min')).toBe('-99.99');
        mudar('Fator do ganho permanente', '0.1');
        fireEvent.click(screen.getByLabelText('Zerar o contador depois'));
        salvar();
        expect(ultima[0].acoes).toEqual([{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', deContador: { id: 'dano', fator: 0.1, zerar: true } }]);
    });
    it('contador com fator 0 ou sem contador e rejeitado', () => {
        abrir('fimDeLuta');
        mudar('Origem do ganho permanente', 'contador'); mudar('Fator do ganho permanente', '1'); salvar();
        expect(ultima).toHaveLength(0);
        cleanup();
        abrir('fimDeLuta');
        mudar('Origem do ganho permanente', 'contador'); mudar('Contador do ganho permanente', 'dano'); mudar('Fator do ganho permanente', '0'); salvar();
        expect(ultima).toHaveLength(0);
    });
    it('a lista descreve: "ganha +2% de Poder (soma)" e "(multiplica)"', () => {
        abrir(); mudar('Valor do ganho permanente', '2'); salvar();
        expect(screen.getByText(/ganha \+2% de Poder \(soma\)/)).toBeTruthy();
        cleanup();
        abrir(); mudar('Como aplicar o ganho permanente', 'multiplicar'); mudar('Valor do ganho permanente', '2'); salvar();
        expect(screen.getByText(/ganha \+2% de Poder \(multiplica\)/)).toBeTruthy();
    });
    it('gatilho legado ja salvo e exibido como "(valor bruto, antigo)" e preservado ao editar', () => {
        const acoes = [{ tipo: 'ganhoPermanente', valor: 2 }];
        render(<Host inicial={[{ id: 'g1', nome: 'Velho', evento: { tipo: 'acertou', nivel: 'normal' }, condicoes: [], acoes, modo: 'automatico' }]} />);
        expect(screen.getByText(/valor bruto, antigo/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Editar gatilho Velho'));
        mudar('Nome do gatilho', 'Velho 2');
        clicar('Salvar gatilho');
        expect(ultima[0].acoes).toEqual(acoes);
        expect(ultima[0].acoes[0].unidade).toBeUndefined();
    });
    it('"Como aplicar" tambem existe dentro de rolarTabela e as acoes saem percentuais', () => {
        render(<Host />); clicar('+ Novo gatilho');
        mudar('Nome do gatilho', 'T'); mudar('Evento do gatilho', 'turnoInicio'); mudar('Tipo da ação', 'rolarTabela');
        const selects = screen.getAllByLabelText(/Tipo da ação/);
        fireEvent.change(selects[selects.length - 1], { target: { value: 'ganhoPermanente' } });
        expect(screen.getAllByLabelText(/Como aplicar o ganho permanente/).length).toBeGreaterThan(0);
    });
    it('trocar o tipo e voltar reseta "Como aplicar" para somar', () => {
        abrir('fimDeLuta');
        mudar('Como aplicar o ganho permanente', 'multiplicar');
        mudar('Tipo da ação', 'mensagem'); mudar('Tipo da ação', 'ganhoPermanente');
        expect(screen.getByLabelText('Como aplicar o ganho permanente').value).toBe('somar');
    });
});
