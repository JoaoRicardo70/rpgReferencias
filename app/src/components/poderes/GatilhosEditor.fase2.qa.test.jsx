import React, { useState } from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import GatilhosEditor from './GatilhosEditor';
import { normalizarGatilhos } from '../../core/gatilhos';

// QA Fase 2 - GatilhosEditor: eventos/acoes novos, criar/editar/remover preservando campos, limites 8/6, frases com nomes.
let ultima;
const CONTADORES = [{ id: 'furia', nome: 'Furia' }, { id: 'q', nome: 'Quebra' }];
const PODERES = [{ id: 'p1', nome: 'Demogorgon' }, { id: 2, nome: 'Aura' }];
function Host({ inicial = [], contadores = CONTADORES, poderes = PODERES }) {
    const [lista, setLista] = useState(inicial);
    ultima = lista;
    return <GatilhosEditor gatilhos={lista} onChange={setLista} contadores={contadores} poderes={poderes} />;
}
afterEach(() => cleanup());
const clicar = (nome) => fireEvent.click(screen.getByText(nome));
const mudar = (rotulo, valor) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
const norm = (l) => normalizarGatilhos(l).gatilhos;
const addAcao = (tipo, campos = {}) => { mudar('Tipo da ação', tipo); Object.entries(campos).forEach(([r, v]) => mudar(r, v)); clicar('+ Ação'); };

describe('GatilhosEditor - criar gatilhos da Fase 2', () => {
    it('Furia: atingido + dois contadores (-2 e -1 com sorteio 1d3)', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        mudar('Nome do gatilho', 'Furia perde');
        mudar('Evento do gatilho', 'atingido');
        addAcao('contador', { 'Contador da ação': 'furia', 'Operação no contador': 'somar', 'Valor para o contador': '-2' });
        addAcao('contador', { 'Contador da ação': 'furia', 'Operação no contador': 'somar', 'Valor para o contador': '-1', 'Sorteio de dados (opcional)': '1d3' });
        clicar('Salvar gatilho');
        expect(ultima).toHaveLength(1);
        expect(ultima[0].evento).toEqual({ tipo: 'atingido', nivel: 'qualquer' });
        expect(ultima[0].acoes).toEqual([{ tipo: 'contador', id: 'furia', op: 'somar', valor: -2 }, { tipo: 'contador', id: 'furia', op: 'somar', valor: -1, sorteio: '1d3' }]);
        expect(semUndefined(ultima)).toBe(true);
        expect(screen.getByText(/Quando eu for atingido: -2 em Furia, -1d3 em Furia|−2 em Furia, −1d3 em Furia/)).toBeTruthy();
    });
    it('Ego Superior: acertou com nivel critico e limite 1 por turno', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        mudar('Evento do gatilho', 'acertou'); mudar('Nível do golpe', 'critico'); mudar('Limite de usos do gatilho', '1:turno');
        addAcao('contador', { 'Contador da ação': 'furia', 'Valor para o contador': '3' });
        clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ evento: { tipo: 'acertou', nivel: 'critico' }, limite: { max: 1, por: 'turno' } });
        expect(screen.getByText(/golpe crítico/)).toBeTruthy(); expect(screen.getByText(/1x por turno/)).toBeTruthy();
    });
    it('Quebra-cascos: contadorAtingiu >= 3 com mensagem + zerar (zerar nao pede valor)', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        mudar('Evento do gatilho', 'contadorAtingiu');
        clicar('Salvar gatilho'); // sem acao -> erro
        expect(screen.getByRole('alert').textContent).toMatch(/pelo menos uma ação/);
        addAcao('mensagem', { 'Texto da mensagem': 'Casco quebrado' });
        clicar('Salvar gatilho'); // sem contador do evento -> erro
        expect(screen.getByRole('alert').textContent).toMatch(/Escolha o contador/);
        mudar('Contador do evento', 'q'); mudar('Valor do contador', '3');
        mudar('Tipo da ação', 'contador'); mudar('Contador da ação', 'q'); mudar('Operação no contador', 'zerar');
        expect(screen.queryByLabelText('Valor para o contador')).toBeNull();
        clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].evento).toEqual({ tipo: 'contadorAtingiu', contadorId: 'q', op: '>=', valor: 3 });
        expect(ultima[0].acoes).toEqual([{ tipo: 'mensagem', texto: 'Casco quebrado' }, { tipo: 'contador', id: 'q', op: 'zerar' }]);
        expect(screen.getByText(/Quebra.*pelo menos 3/)).toBeTruthy();
    });
    it('contadorAtingiu com op == e valor negativo', () => {
        render(<Host />);
        clicar('+ Novo gatilho'); mudar('Evento do gatilho', 'contadorAtingiu'); mudar('Contador do evento', 'furia'); mudar('Comparação do contador', '=='); mudar('Valor do contador', '-2');
        addAcao('mensagem', { 'Texto da mensagem': 'x' }); clicar('Salvar gatilho');
        expect(ultima[0].evento).toEqual({ tipo: 'contadorAtingiu', contadorId: 'furia', op: '==', valor: -2 });
    });
    it('poderLigou: "Este Poder" (sem poderId), "Qualquer Poder" e um Poder especifico (id numerico vira texto)', () => {
        render(<Host />);
        const criar = (sel) => { clicar('+ Novo gatilho'); mudar('Evento do gatilho', 'poderLigou'); mudar('Qual Poder', sel); addAcao('mensagem', { 'Texto da mensagem': 'x' }); clicar('Salvar gatilho'); };
        criar(''); criar('qualquer'); criar('2');
        expect(ultima.map(g => g.evento)).toEqual([{ tipo: 'poderLigou' }, { tipo: 'poderLigou', poderId: 'qualquer' }, { tipo: 'poderLigou', poderId: '2' }]);
        expect(screen.getByText(/Quando Aura ligar/)).toBeTruthy(); expect(screen.getByText(/Quando este Poder ligar/)).toBeTruthy();
    });
    it('acoes de Poder/estado/dano: ligarPoder, desligarPoder, aplicarEstado (stacks), removerEstado, danoEmSi (percMax)', () => {
        render(<Host />);
        clicar('+ Novo gatilho'); mudar('Evento do gatilho', 'turnoInicio');
        addAcao('ligarPoder', { 'Poder da ação': 'p1' });
        addAcao('desligarPoder', { 'Poder da ação': '2' });
        addAcao('aplicarEstado', { 'Estado': 'queimado', 'Valor da ação': '3' });
        addAcao('removerEstado', { 'Estado': 'queimado' });
        addAcao('danoEmSi', { 'Tipo do dano em si': 'percMax', 'Valor da ação': '10' });
        clicar('Salvar gatilho');
        expect(ultima[0].acoes).toEqual([
            { tipo: 'ligarPoder', poderId: 'p1' }, { tipo: 'desligarPoder', poderId: '2' }, { tipo: 'aplicarEstado', estado: 'queimado', stacks: 3 },
            { tipo: 'removerEstado', estado: 'queimado' }, { tipo: 'danoEmSi', modo: 'percMax', valor: 10 },
        ]);
        expect(screen.getByText(/ligar Demogorgon/)).toBeTruthy(); expect(screen.getByText(/desligar Aura/)).toBeTruthy();
    });
    it('acao incompleta e recusada com aviso (ligar Poder sem escolher; contador sem id; danoEmSi sem valor)', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        mudar('Tipo da ação', 'ligarPoder'); clicar('+ Ação'); expect(screen.getByRole('alert').textContent).toMatch(/Ação incompleta/);
        mudar('Tipo da ação', 'contador'); clicar('+ Ação'); expect(screen.getByRole('alert').textContent).toMatch(/Ação incompleta/);
        mudar('Tipo da ação', 'danoEmSi'); clicar('+ Ação'); expect(screen.getByRole('alert').textContent).toMatch(/Ação incompleta/);
        clicar('Salvar gatilho'); expect(screen.getByRole('alert').textContent).toMatch(/pelo menos uma ação/);
        expect(ultima).toEqual([]);
    });
    it('sorteio invalido ("abc") recusa a acao; "2D6" vira 2d6', () => {
        render(<Host />);
        clicar('+ Novo gatilho'); mudar('Evento do gatilho', 'acertou');
        addAcao('contador', { 'Contador da ação': 'furia', 'Valor para o contador': '1', 'Sorteio de dados (opcional)': 'abc' });
        expect(screen.getByRole('alert').textContent).toMatch(/Ação incompleta/);
        mudar('Sorteio de dados (opcional)', '2D6'); clicar('+ Ação'); clicar('Salvar gatilho');
        expect(ultima[0].acoes[0]).toMatchObject({ sorteio: '2d6' });
    });
    it('limite de 6 acoes por gatilho: a 7a e recusada', () => {
        render(<Host />);
        clicar('+ Novo gatilho'); mudar('Evento do gatilho', 'turnoInicio');
        for (let i = 0; i < 7; i++) addAcao('mensagem', { 'Texto da mensagem': `m${i}` });
        expect(screen.getByRole('alert').textContent).toMatch(/No máximo 6/);
        clicar('Salvar gatilho'); expect(ultima[0].acoes).toHaveLength(6);
    });
    it('limite de 8 gatilhos por Poder: o botao novo fica desabilitado', () => {
        const base = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, nome: `G${i}`, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] }));
        render(<Host inicial={norm(base)} />);
        expect(screen.getByText('+ Novo gatilho').disabled).toBe(true);
    });
    it('trocar o evento para um que nao e danoQueZeraria remove a acao "anular o dano" e a esconde da lista', () => {
        render(<Host />);
        clicar('+ Novo gatilho');
        addAcao('anularDano'); mudar('Evento do gatilho', 'acertou');
        expect(screen.queryByRole('option', { name: 'Anular o dano' })).toBeNull();
        addAcao('mensagem', { 'Texto da mensagem': 'ok' }); clicar('Salvar gatilho');
        expect(ultima[0].acoes).toEqual([{ tipo: 'mensagem', texto: 'ok' }]);
    });
});

describe('GatilhosEditor - editar/remover preservando campos', () => {
    const exemplos = () => norm([
        { id: 'a', nome: 'Ego', notas: 'nota', prioridade: 7, passivo: true, modo: 'opcional', armado: true, mestreDesligou: true, evento: { tipo: 'acertou', nivel: 'fatal' }, limite: { max: 2, por: 'turno' }, condicoes: ['vida_maior_que:5'], acoes: [{ tipo: 'contador', id: 'furia', op: 'somar', valor: 4 }] },
        { id: 'b', nome: 'Quebra', evento: { tipo: 'contadorAtingiu', contadorId: 'q', op: '==', valor: 3 }, acoes: [{ tipo: 'contador', id: 'q', op: 'zerar' }] },
        { id: 'c', nome: 'Liga', evento: { tipo: 'poderDesligou', poderId: 'qualquer' }, acoes: [{ tipo: 'ligarPoder', poderId: 'p1' }] },
        { id: 'd', nome: 'Dano', evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'danoEmSi', modo: 'percAtual', valor: 5 }, { tipo: 'aplicarEstado', estado: 'queimado', stacks: 2 }] },
    ]);
    it('abrir e salvar SEM mexer nao muda nada em nenhum dos gatilhos (round trip idempotente)', () => {
        const antes = exemplos();
        render(<Host inicial={antes} />);
        antes.forEach((g) => { fireEvent.click(screen.getByLabelText(`Editar gatilho ${g.nome}`)); clicar('Salvar gatilho'); });
        expect(ultima).toEqual(antes);
    });
    it('editar so o nome preserva notas, prioridade, passivo, modo, armado, mestreDesligou, limite turno, condicao e nivel', () => {
        render(<Host inicial={exemplos()} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Ego'));
        mudar('Nome do gatilho', 'Ego 2'); clicar('Salvar gatilho');
        expect(ultima[0]).toMatchObject({ id: 'a', nome: 'Ego 2', notas: 'nota', prioridade: 7, passivo: true, modo: 'opcional', armado: true, mestreDesligou: true, limite: { max: 2, por: 'turno' }, condicoes: ['vida_maior_que:5'], evento: { tipo: 'acertou', nivel: 'fatal' } });
        expect(ultima).toHaveLength(4); expect(semUndefined(ultima)).toBe(true);
    });
    it('trocar o evento de contadorAtingiu para turnoInicio limpa os campos do evento antigo', () => {
        render(<Host inicial={exemplos()} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Quebra'));
        mudar('Evento do gatilho', 'turnoInicio'); clicar('Salvar gatilho');
        expect(ultima[1].evento).toEqual({ tipo: 'turnoInicio' });
    });
    it('remover tira so aquele gatilho; remover acao dentro do formulario nao mexe nos outros', () => {
        render(<Host inicial={exemplos()} />);
        fireEvent.click(screen.getByLabelText('Remover gatilho Liga'));
        expect(ultima.map(g => g.id)).toEqual(['a', 'b', 'd']);
        fireEvent.click(screen.getByLabelText('Editar gatilho Dano'));
        fireEvent.click(screen.getByLabelText('Remover ação 1')); clicar('Salvar gatilho');
        expect(ultima.find(g => g.id === 'd').acoes).toEqual([{ tipo: 'aplicarEstado', estado: 'queimado', stacks: 2 }]);
    });
    it('cancelar nao altera a lista', () => {
        const antes = exemplos(); render(<Host inicial={antes} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Ego')); mudar('Nome do gatilho', 'xxx'); clicar('Cancelar');
        expect(ultima).toEqual(antes);
    });
    it('sem contadores/poderes (props ausentes): frases caem para o id do contador / "um Poder" e as listas ficam vazias sem quebrar', () => {
        render(<Host inicial={exemplos()} contadores={undefined} poderes={null} />);
        expect(screen.getByText(/4 em Furia/)).toBeTruthy(); expect(screen.getByText(/ligar um Poder/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Editar gatilho Quebra'));
        expect(screen.getByLabelText('Contador do evento').querySelectorAll('option').length).toBeGreaterThanOrEqual(1);
    });
    it('gatilho do Poder com contador/poder que nao existem mais: abre e salva sem perder o id', () => {
        render(<Host inicial={exemplos()} contadores={[]} poderes={[]} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Liga')); clicar('Salvar gatilho');
        expect(ultima.find(g => g.id === 'c').acoes[0]).toEqual({ tipo: 'ligarPoder', poderId: 'p1' });
    });
    it('limite incomum ja salvo (3 por turno) aparece como opcao e e preservado', () => {
        const g = norm([{ id: 'z', nome: 'Z', evento: { tipo: 'acertou' }, limite: { max: 3, por: 'turno' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] }]);
        render(<Host inicial={g} />);
        fireEvent.click(screen.getByLabelText('Editar gatilho Z'));
        expect(screen.getByLabelText('Limite de usos do gatilho').value).toBe('3:turno');
        clicar('Salvar gatilho'); expect(ultima[0].limite).toEqual({ max: 3, por: 'turno' });
    });
});
