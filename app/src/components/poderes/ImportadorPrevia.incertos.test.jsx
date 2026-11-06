import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ImportadorPrevia from './ImportadorPrevia';
import { prepararImportacao, contarPendentes, decidirTodosOsIncertos } from '../../core/importadorIA';

const ef = (atributo, valor) => ({ nome: 'Bônus', atributo, propriedade: 'base', valor });
const brutos = () => [{
    nome: 'Rinnegan', categoria: 'poder',
    efeitosIncertos: [ef('acerto', 10)],
    subHabilidades: [{ nome: 'Limbo', efeitos: [ef('forca', 2)], efeitosIncertos: [ef('evasiva', 4)] }, { nome: 'Izanagi' }],
}];

function montar(itens) {
    const props = { itens, onAtualizar: vi.fn(), onRemover: vi.fn(), onConfirmar: vi.fn(), onVoltar: vi.fn(), onAdicionarOutra: vi.fn() };
    render(<ImportadorPrevia {...props} />);
    return props;
}
const itens = () => prepararImportacao(brutos(), 'poder', 1);
const gravar = () => screen.getByRole('button', { name: /Gravar/ });

afterEach(() => cleanup());

describe('ImportadorPrevia - sub-habilidades e incertos', () => {
    it('mostra sub-habilidades e botoes por efeito incerto', () => {
        montar(itens());
        expect(screen.getByText('Limbo')).toBeTruthy();
        expect(screen.getByText('Izanagi')).toBeTruthy();
        expect(screen.getAllByText('⚡ Só ao ativar')).toHaveLength(2);
        expect(screen.getAllByText('🛡️ Sempre (passivo)')).toHaveLength(2);
        expect(screen.getByText('Todos só ao ativar')).toBeTruthy();
        expect(screen.getByText('Todos sempre')).toBeTruthy();
    });

    it('Gravar desabilitado com pendentes e mostra aviso', () => {
        montar(itens());
        expect(gravar().disabled).toBe(true);
        expect(screen.getByRole('status').textContent).toMatch(/2 efeito/);
    });

    it('Gravar habilitado quando tudo decidido e chama onConfirmar', () => {
        const its = itens();
        its[0].objeto = decidirTodosOsIncertos(its[0].objeto, 'ativo');
        const p = montar(its);
        expect(gravar().disabled).toBe(false);
        expect(screen.queryByRole('status')).toBeNull();
        fireEvent.click(gravar());
        expect(p.onConfirmar).toHaveBeenCalledTimes(1);
    });

    it('item desmarcado nao bloqueia Gravar', () => {
        const its = [...itens(), ...prepararImportacao([{ nome: 'Ok' }], 'habilidade', 2)];
        its[0].marcado = false;
        montar(its);
        expect(gravar().disabled).toBe(false);
    });

    it('item invalido com pendentes nao bloqueia', () => {
        const its = [...itens(), ...prepararImportacao([{ nome: 'Ok' }], 'habilidade', 2)];
        its[0].valido = false; its[0].marcado = false;
        montar(its);
        expect(gravar().disabled).toBe(false);
    });

    it('clicar em Só ao ativar no efeito do pai chama onAtualizar sem mutar', () => {
        const its = itens();
        const original = JSON.parse(JSON.stringify(its[0].objeto));
        const p = montar(its);
        fireEvent.click(screen.getAllByText('⚡ Só ao ativar')[0]);
        const [chave, novo] = p.onAtualizar.mock.calls[0];
        expect(chave).toBe(1);
        expect(novo.objeto.efeitosIncertos[0].destino).toBe('ativo');
        expect(its[0].objeto).toEqual(original);
    });

    it('clicar Sempre no efeito da forma decide na forma', () => {
        const p = montar(itens());
        fireEvent.click(screen.getAllByText('🛡️ Sempre (passivo)')[1]);
        const novo = p.onAtualizar.mock.calls[0][1];
        expect(novo.objeto.formas[0].configs[0].efeitosIncertos[0].destino).toBe('passivo');
        expect(contarPendentes(novo.objeto)).toBe(1);
    });

    it('Todos sempre / Todos so ao ativar decidem tudo', () => {
        const p = montar(itens());
        fireEvent.click(screen.getByText('Todos sempre'));
        const o1 = p.onAtualizar.mock.calls[0][1].objeto;
        expect(contarPendentes(o1)).toBe(0);
        expect(o1.efeitosIncertos[0].destino).toBe('passivo');
        fireEvent.click(screen.getByText('Todos só ao ativar'));
        expect(p.onAtualizar.mock.calls[1][1].objeto.efeitosIncertos[0].destino).toBe('ativo');
    });

    it('X da sub remove so aquela forma', () => {
        const p = montar(itens());
        fireEvent.click(screen.getByLabelText('Tirar Limbo'));
        const novo = p.onAtualizar.mock.calls[0][1];
        expect(novo.objeto.formas.map(f => f.nome)).toEqual(['Izanagi']);
        expect(p.onRemover).not.toHaveBeenCalled();
    });

    it('X do item chama onRemover', () => {
        const p = montar(itens());
        fireEvent.click(screen.getByLabelText('Tirar da lista'));
        expect(p.onRemover).toHaveBeenCalledWith(1);
    });

    it('botao escolhido fica aria-pressed', () => {
        const its = itens();
        its[0].objeto = decidirTodosOsIncertos(its[0].objeto, 'passivo');
        montar(its);
        screen.getAllByText('🛡️ Sempre (passivo)').forEach(b => expect(b.getAttribute('aria-pressed')).toBe('true'));
        screen.getAllByText('⚡ Só ao ativar').forEach(b => expect(b.getAttribute('aria-pressed')).toBe('false'));
    });

    it('sem formas/incertos nada disso aparece', () => {
        montar(prepararImportacao([{ nome: 'Golpe' }], 'habilidade', 1));
        expect(screen.queryByRole('group')).toBeNull();
        expect(screen.queryByText('Todos sempre')).toBeNull();
        expect(screen.queryByText(/Habilidades dentro/)).toBeNull();
        expect(gravar().disabled).toBe(false);
    });

    it('modo tecnica (elementos) sem incertos segue funcionando', () => {
        const its = [{ chave: 1, marcado: true, valido: true, avisos: [], naoAplicado: [], objeto: { nome: 'Bola', elemento: 'Fogo' } }];
        const props = { itens: its, onAtualizar: vi.fn(), onRemover: vi.fn(), onConfirmar: vi.fn(), onVoltar: vi.fn(), onAdicionarOutra: vi.fn(), elementos: ['Fogo', 'Agua'], resumir: () => 'res' };
        render(<ImportadorPrevia {...props} />);
        expect(screen.getByLabelText('Elemento')).toBeTruthy();
        expect(gravar().disabled).toBe(false);
    });

    it('forma sem configs nao quebra a renderizacao', () => {
        const its = itens();
        its[0].objeto = { ...its[0].objeto, efeitosIncertos: undefined, formas: [{ nome: 'Solta' }] };
        montar(its);
        expect(screen.getByText('Solta')).toBeTruthy();
    });
});
