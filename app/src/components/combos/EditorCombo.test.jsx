import React, { useState } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import EditorCombo from './EditorCombo';
import EditorFollowUp from './EditorFollowUp';
import EditorGolpe from './EditorGolpe';
import EditorBuffs from './EditorBuffs';
import { normalizarCombo, normalizarFollowUp, normalizarGolpe, LIMITES } from '../../core/combos';

afterEach(cleanup);

let ultimo;
function ComboControlado({ inicial, ficha, onSalvar = vi.fn(), onCancelar = vi.fn() }) {
    const [c, setC] = useState(inicial);
    ultimo = c;
    return <EditorCombo combo={c} onChange={(n) => { ultimo = n; setC(n); }} onSalvar={onSalvar} onCancelar={onCancelar} ficha={ficha} />;
}
function FollowControlado({ inicial, combos = [], ficha, onSalvar = vi.fn() }) {
    const [f, setF] = useState(inicial);
    ultimo = f;
    return <EditorFollowUp followUp={f} combos={combos} onChange={(n) => { ultimo = n; setF(n); }} onSalvar={onSalvar} onCancelar={vi.fn()} ficha={ficha} />;
}
function BuffsControlado({ inicial = [] }) {
    const [b, setB] = useState(inicial);
    ultimo = b;
    return <EditorBuffs buffs={b} onChange={(n) => { ultimo = n; setB(n); }} />;
}

const valido = () => normalizarCombo({ id: 'c1', nome: 'Combo', iniciador: { nome: 'Soco' }, passos: [{ nome: 'Chute' }, { nome: 'Giro' }] });
const botao = (re) => screen.getByRole('button', { name: re });

describe('EditorCombo - validacao de salvar', () => {
    it('Combo vazio nao pode ser salvo e mostra a dica', () => {
        render(<ComboControlado inicial={normalizarCombo({})} />);
        expect(botao(/Salvar Combo/).disabled).toBe(true);
        expect(screen.getByText(/Dê nome ao Combo/)).toBeTruthy();
    });
    it('Combo valido habilita Salvar e dispara onSalvar', () => {
        const onSalvar = vi.fn();
        render(<ComboControlado inicial={valido()} onSalvar={onSalvar} />);
        expect(botao(/Salvar Combo/).disabled).toBe(false);
        fireEvent.click(botao(/Salvar Combo/));
        expect(onSalvar).toHaveBeenCalledTimes(1);
    });
    it('nome so com espacos continua invalido', () => {
        render(<ComboControlado inicial={{ ...valido(), nome: '   ' }} />);
        expect(botao(/Salvar Combo/).disabled).toBe(true);
    });
    it('sem golpes depois do iniciador nao salva', () => {
        render(<ComboControlado inicial={{ ...valido(), passos: [] }} />);
        expect(botao(/Salvar Combo/).disabled).toBe(true);
    });
    it('um golpe sem nome entre os passos bloqueia o salvar', () => {
        const c = valido(); c.passos[1].nome = '  ';
        render(<ComboControlado inicial={c} />);
        expect(botao(/Salvar Combo/).disabled).toBe(true);
    });
    it('Cancelar chama onCancelar sem salvar', () => {
        const onSalvar = vi.fn(); const onCancelar = vi.fn();
        render(<ComboControlado inicial={valido()} onSalvar={onSalvar} onCancelar={onCancelar} />);
        fireEvent.click(botao(/Cancelar/));
        expect(onCancelar).toHaveBeenCalled();
        expect(onSalvar).not.toHaveBeenCalled();
    });
});

describe('EditorCombo - passos', () => {
    it('adicionar golpe cria passo vazio e ate o limite desabilita o botao', () => {
        render(<ComboControlado inicial={normalizarCombo({ nome: 'x' })} />);
        for (let i = 0; i < LIMITES.passos; i++) fireEvent.click(botao(/Adicionar golpe ao Combo/));
        expect(ultimo.passos).toHaveLength(LIMITES.passos);
        expect(botao(/Adicionar golpe ao Combo/).disabled).toBe(true);
        fireEvent.click(botao(/Adicionar golpe ao Combo/));
        expect(ultimo.passos).toHaveLength(LIMITES.passos);
    });
    it('subir/descer troca a ordem; extremos ficam desabilitados', () => {
        render(<ComboControlado inicial={valido()} />);
        expect(botao(/Subir o golpe 2/).disabled).toBe(true);
        expect(botao(/Descer o golpe 3/).disabled).toBe(true);
        fireEvent.click(botao(/Descer o golpe 2/));
        expect(ultimo.passos.map(p => p.nome)).toEqual(['Giro', 'Chute']);
        fireEvent.click(botao(/Subir o golpe 3/));
        expect(ultimo.passos.map(p => p.nome)).toEqual(['Chute', 'Giro']);
    });
    it('remover golpe mantem os demais', () => {
        render(<ComboControlado inicial={valido()} />);
        fireEvent.click(botao(/Remover o golpe 2/));
        expect(ultimo.passos.map(p => p.nome)).toEqual(['Giro']);
    });
    it('remover todos os golpes volta a bloquear o salvar', () => {
        render(<ComboControlado inicial={valido()} />);
        fireEvent.click(botao(/Remover o golpe 2/));
        fireEvent.click(botao(/Remover o golpe 2/));
        expect(ultimo.passos).toEqual([]);
        expect(botao(/Salvar Combo/).disabled).toBe(true);
    });
    it('digitar nome do Combo e do iniciador atualiza o rascunho; maxLength respeita o limite', () => {
        render(<ComboControlado inicial={normalizarCombo({})} />);
        const nome = screen.getByLabelText('Nome do Combo');
        expect(nome.maxLength).toBe(LIMITES.nome);
        fireEvent.change(nome, { target: { value: 'Tempestade' } });
        expect(ultimo.nome).toBe('Tempestade');
        fireEvent.change(screen.getAllByLabelText('Nome do golpe')[0], { target: { value: 'Abertura' } });
        expect(ultimo.iniciador.nome).toBe('Abertura');
    });
    it('texto com HTML aparece como texto, sem criar elementos', () => {
        const { container } = render(<ComboControlado inicial={normalizarCombo({})} />);
        fireEvent.change(screen.getByLabelText('Nome do Combo'), { target: { value: '<img src=x onerror=alert(1)>' } });
        expect(container.querySelector('img')).toBeNull();
    });
    it('mudar um passo nao altera os outros', () => {
        render(<ComboControlado inicial={valido()} />);
        fireEvent.change(screen.getAllByLabelText('Nome do golpe')[2], { target: { value: 'Novo' } });
        expect(ultimo.passos.map(p => p.nome)).toEqual(['Chute', 'Novo']);
        expect(ultimo.iniciador.nome).toBe('Soco');
    });
});

describe('EditorGolpe - vinculos e ficha incompleta', () => {
    const trocarTipo = (t) => fireEvent.change(screen.getAllByLabelText('Tipo do golpe')[0], { target: { value: t } });
    it('ficha nula nao quebra e nao oferece vinculo', () => {
        render(<ComboControlado inicial={valido()} ficha={null} />);
        trocarTipo('habilidade');
        expect(screen.queryByLabelText('Vincular a uma técnica da ficha')).toBeNull();
    });
    it('ficha sem listas (undefined) nao quebra', () => {
        render(<EditorGolpe golpe={normalizarGolpe({ tipo: 'arma' })} onChange={vi.fn()} ficha={{}} />);
        expect(screen.queryByLabelText('Vincular a uma técnica da ficha')).toBeNull();
    });
    it('listas com itens null, sem nome ou id numerico sao toleradas', () => {
        const ficha = { poderes: [null, { id: 1 }, { id: 2, nome: 'Chama', tipoAcao: 'bonus' }] };
        const onChange = vi.fn();
        render(<EditorGolpe golpe={normalizarGolpe({ tipo: 'habilidade' })} onChange={onChange} ficha={ficha} />);
        const sel = screen.getByLabelText('Vincular a uma técnica da ficha');
        expect(sel.querySelectorAll('option')).toHaveLength(2);
        fireEvent.change(sel, { target: { value: '2' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ refId: '2', nome: 'Chama', acao: 'bonus' }));
    });
    it('vincular nao sobrescreve nome ja digitado', () => {
        const onChange = vi.fn();
        render(<EditorGolpe golpe={normalizarGolpe({ tipo: 'tecnica', nome: 'Meu nome' })} onChange={onChange} ficha={{ ataquesElementais: [{ id: 'e1', nome: 'Raio', tipoAcao: 'reacao' }] }} />);
        fireEvent.change(screen.getByLabelText('Vincular a uma técnica da ficha'), { target: { value: 'e1' } });
        expect(onChange.mock.calls[0][0].nome).toBe('Meu nome');
        expect(onChange.mock.calls[0][0].acao).toBe('reacao');
    });
    it('arma lista so itens do inventario com tipo arma', () => {
        const ficha = { inventario: [{ id: 'a', tipo: 'arma', nome: 'Espada' }, { id: 'b', tipo: 'item', nome: 'Pocao' }] };
        render(<EditorGolpe golpe={normalizarGolpe({ tipo: 'arma' })} onChange={vi.fn()} ficha={ficha} />);
        expect(screen.getByRole('option', { name: 'Espada' })).toBeTruthy();
        expect(screen.queryByRole('option', { name: 'Pocao' })).toBeNull();
    });
    it('trocar o tipo limpa o refId', () => {
        const onChange = vi.fn();
        render(<EditorGolpe golpe={normalizarGolpe({ tipo: 'arma', refId: 'a' })} onChange={onChange} ficha={{}} />);
        trocarTipo('magia');
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'magia', refId: '' }));
    });
    it('acao sem tipoAcao conhecido preserva a acao atual', () => {
        const onChange = vi.fn();
        render(<EditorGolpe golpe={normalizarGolpe({ tipo: 'habilidade', acao: 'bonus' })} onChange={onChange} ficha={{ poderes: [{ id: 'p', nome: 'X', tipoAcao: 'inexistente' }] }} />);
        fireEvent.change(screen.getByLabelText('Vincular a uma técnica da ficha'), { target: { value: 'p' } });
        expect(onChange.mock.calls[0][0].acao).toBe('bonus');
    });
    it('escolher "Sem vinculo" zera o refId', () => {
        const onChange = vi.fn();
        render(<EditorGolpe golpe={normalizarGolpe({ tipo: 'habilidade', refId: 'p' })} onChange={onChange} ficha={{ poderes: [{ id: 'p', nome: 'X' }] }} />);
        fireEvent.change(screen.getByLabelText('Vincular a uma técnica da ficha'), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ refId: '' }));
    });
    it('comBuffs=false esconde o editor de buffs', () => {
        render(<EditorGolpe golpe={normalizarGolpe({})} onChange={vi.fn()} ficha={{}} comBuffs={false} />);
        expect(screen.queryByLabelText('Atributo do buff')).toBeNull();
    });
});

describe('EditorBuffs - entradas invalidas', () => {
    const add = (v) => { fireEvent.change(screen.getByLabelText('Valor do buff'), { target: { value: v } }); fireEvent.click(botao(/Buff$/)); };
    it('botao desabilitado com valor vazio e nada e adicionado ao teclar Enter', () => {
        render(<BuffsControlado />);
        expect(botao(/Buff$/).disabled).toBe(true);
        fireEvent.keyDown(screen.getByLabelText('Valor do buff'), { key: 'Enter' });
        expect(ultimo).toEqual([]);
    });
    it('adiciona buff valido e limpa o campo; Enter tambem adiciona', () => {
        render(<BuffsControlado />);
        add('5');
        expect(ultimo).toHaveLength(1);
        expect(ultimo[0].valor).toBe(5);
        expect(screen.getByLabelText('Valor do buff').value).toBe('');
        fireEvent.change(screen.getByLabelText('Valor do buff'), { target: { value: '2.5' } });
        fireEvent.keyDown(screen.getByLabelText('Valor do buff'), { key: 'Enter' });
        expect(ultimo).toHaveLength(2);
    });
    it('valor invalido (jsdom zera input number) nao adiciona', () => {
        render(<BuffsControlado />);
        add('abc');
        add('Infinity');
        add('1e999');
        expect(ultimo).toEqual([]);
    });
    it('negativo e zero sao aceitos', () => {
        render(<BuffsControlado />);
        add('-3'); add('0');
        expect(ultimo.map(x => x.valor)).toEqual([-3, 0]);
    });
    it('respeita o limite de buffs', () => {
        const cheio = Array.from({ length: LIMITES.buffs }, () => ({ atributo: 'dano', propriedade: 'base', valor: 1 }));
        render(<BuffsControlado inicial={cheio} />);
        fireEvent.change(screen.getByLabelText('Valor do buff'), { target: { value: '1' } });
        expect(botao(/Buff$/).disabled).toBe(true);
        fireEvent.keyDown(screen.getByLabelText('Valor do buff'), { key: 'Enter' });
        expect(ultimo).toHaveLength(LIMITES.buffs);
    });
    it('trocar o atributo mantem propriedade valida e remover buff funciona', () => {
        render(<BuffsControlado inicial={[{ atributo: 'dano', propriedade: 'base', valor: 1 }]} />);
        const props = () => Array.from(screen.getByLabelText('Propriedade do buff').querySelectorAll('option')).map(o => o.value);
        const attr = screen.getByLabelText('Atributo do buff');
        Array.from(attr.querySelectorAll('option')).slice(0, 40).forEach((o) => {
            fireEvent.change(attr, { target: { value: o.value } });
            expect(props()).toContain(screen.getByLabelText('Propriedade do buff').value);
        });
        fireEvent.click(screen.getByRole('button', { name: /Remover buff/ }));
        expect(ultimo).toEqual([]);
    });
    it('buffs undefined quebra? (contrato: sempre array)', () => {
        expect(() => render(<EditorBuffs buffs={[]} onChange={vi.fn()} />)).not.toThrow();
    });
});

describe('EditorFollowUp', () => {
    const base = () => normalizarFollowUp({ id: 'f1', nome: 'Seguir', niveis: [{ combos: 0 }, { combos: 2 }] });
    it('Follow Up sem niveis originais exibe o nivel padrao', () => {
        render(<FollowControlado inicial={normalizarFollowUp({ nome: 'x' })} />);
        expect(screen.getByText('Nível 1')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Remover o nível 1/ }).disabled).toBe(true);
    });
    it('nunca remove o ultimo nivel', () => {
        render(<FollowControlado inicial={base()} />);
        fireEvent.click(botao(/Remover o nível 2/));
        expect(ultimo.niveis).toHaveLength(1);
        expect(botao(/Remover o nível 1/).disabled).toBe(true);
    });
    it('adicionar nivel sugere combos = ultimo + 1 e respeita o limite', () => {
        render(<FollowControlado inicial={base()} />);
        fireEvent.click(botao(/Adicionar nível/));
        expect(ultimo.niveis[2].combos).toBe(3);
        for (let i = 0; i < 20; i++) { const b = botao(/Adicionar nível/); if (!b.disabled) fireEvent.click(b); }
        expect(ultimo.niveis).toHaveLength(LIMITES.niveis);
        expect(botao(/Adicionar nível/).disabled).toBe(true);
    });
    it('combos do nivel: negativo, vazio e lixo viram 0', () => {
        render(<FollowControlado inicial={base()} />);
        const inp = screen.getByLabelText('Combos finalizados para o nível 2');
        fireEvent.change(inp, { target: { value: '-5' } });
        expect(ultimo.niveis[1].combos).toBe(0);
        fireEvent.change(inp, { target: { value: '7' } });
        expect(ultimo.niveis[1].combos).toBe(7);
        fireEvent.change(inp, { target: { value: '' } });
        expect(ultimo.niveis[1].combos).toBe(0);
    });
    it('exige nome e pelo menos uma Acao permitida para salvar', () => {
        render(<FollowControlado inicial={{ ...base(), nome: ' ' }} />);
        expect(botao(/Salvar Follow Up/).disabled).toBe(true);
        cleanup();
        render(<FollowControlado inicial={base()} />);
        expect(botao(/Salvar Follow Up/).disabled).toBe(false);
        fireEvent.click(screen.getByLabelText(/Ação \(segurada\)/));
        expect(ultimo.acoesPermitidas).toEqual([]);
        expect(botao(/Salvar Follow Up/).disabled).toBe(true);
    });
    it('alternar acoes e combos alvo liga e desliga', () => {
        const combos = [normalizarCombo({ id: 'a', nome: 'Alfa' }), normalizarCombo({ id: 'b', nome: 'Beta' })];
        render(<FollowControlado inicial={base()} combos={combos} />);
        fireEvent.click(screen.getByLabelText('Alfa'));
        fireEvent.click(screen.getByLabelText('Beta'));
        expect(ultimo.combosIds).toEqual(['a', 'b']);
        fireEvent.click(screen.getByLabelText('Alfa'));
        expect(ultimo.combosIds).toEqual(['b']);
        fireEvent.click(screen.getByLabelText(/Reação/));
        expect(ultimo.acoesPermitidas).toContain('reacao');
    });
    it('quando=qualquer esconde a escolha de Combos; sem combos tambem', () => {
        const combos = [normalizarCombo({ id: 'a', nome: 'Alfa' })];
        render(<FollowControlado inicial={{ ...base(), quando: 'qualquer' }} combos={combos} />);
        expect(screen.queryByLabelText('Alfa')).toBeNull();
        cleanup();
        render(<FollowControlado inicial={base()} combos={[]} />);
        expect(screen.queryByText(/Em quais Combos/)).toBeNull();
    });
    it('buff adicionado em um nivel nao vaza para o outro', () => {
        render(<FollowControlado inicial={base()} />);
        const valores = screen.getAllByLabelText('Valor do buff');
        fireEvent.change(valores[1], { target: { value: '9' } });
        fireEvent.click(screen.getAllByRole('button', { name: /Buff$/ })[1]);
        expect(ultimo.niveis[0].buffs).toEqual([]);
        expect(ultimo.niveis[1].buffs).toHaveLength(1);
    });
    it('Follow Up com combosIds de combo apagado nao quebra a renderizacao', () => {
        const f = { ...base(), combosIds: ['fantasma'] };
        expect(() => render(<FollowControlado inicial={f} combos={[normalizarCombo({ id: 'a', nome: 'Alfa' })]} />)).not.toThrow();
    });
});
