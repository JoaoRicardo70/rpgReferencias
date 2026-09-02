import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FormasEditor from './FormasEditor';

// ---------------------------------------------------------------------------
// QA — 🥋 Maestria nas Formas (FormasEditor.jsx), o editor compartilhado usado
// identicamente por ficha.poderes[]/inventario[]/seresSelados[]. Componente
// puramente controlado por props (sem store/contexto), então é testado
// diretamente sem mocks de Zustand/Firebase.
// ---------------------------------------------------------------------------

function abrirPainel() {
    fireEvent.click(screen.getByText(/FORMAS MÍSTICAS/i));
}

afterEach(() => {
    cleanup();
});

describe('FormasEditor - Maestria: pré-preenchimento ao editar uma Forma existente', () => {
    it('abrir uma Forma existente com maestria=0 pré-preenche o campo com 0', () => {
        const forma = { id: 'f1', nome: 'Forma Base', maestria: 0, configs: [] };
        render(<FormasEditor formas={[forma]} formaAtivaId={null} configAtivaId={null} onSalvarForma={vi.fn()} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();
        fireEvent.click(screen.getByText('EDITAR'));

        const input = screen.getByDisplayValue('0');
        expect(input).toBeDefined();
        expect(input.tagName).toBe('INPUT');
    });

    it('abrir uma Forma existente com maestria=65 pré-preenche o campo com esse valor', () => {
        const forma = { id: 'f1', nome: 'Forma Avançada', maestria: 65, configs: [] };
        render(<FormasEditor formas={[forma]} formaAtivaId={null} configAtivaId={null} onSalvarForma={vi.fn()} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();
        fireEvent.click(screen.getByText('EDITAR'));

        expect(screen.getByDisplayValue('65')).toBeDefined();
    });

    it('abrir uma Forma legada SEM o campo maestria (undefined) pré-preenche o campo com 0 (fallback)', () => {
        const forma = { id: 'f1', nome: 'Forma Legada', configs: [] }; // sem maestria
        render(<FormasEditor formas={[forma]} formaAtivaId={null} configAtivaId={null} onSalvarForma={vi.fn()} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();
        fireEvent.click(screen.getByText('EDITAR'));

        expect(screen.getByDisplayValue('0')).toBeDefined();
    });
});

describe('FormasEditor - Maestria: criação de nova Forma', () => {
    it('forjar uma Forma nova abre o editor com Maestria zerada por padrão', () => {
        render(<FormasEditor formas={[]} formaAtivaId={null} configAtivaId={null} onSalvarForma={vi.fn()} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();
        fireEvent.click(screen.getByText(/FORJAR NOVA FORMA MÍSTICA/i));

        expect(screen.getByText(/Maestria nesta Forma/i)).toBeDefined();
        expect(screen.getByDisplayValue('0')).toBeDefined();
    });
});

describe('FormasEditor - Maestria: edição, clamp e salvamento', () => {
    it('alterar o valor de Maestria e salvar chama onSalvarForma com o novo valor incluído', () => {
        const onSalvarForma = vi.fn();
        const forma = { id: 'f1', nome: 'Forma Base', maestria: 0, configs: [] };
        render(<FormasEditor formas={[forma]} formaAtivaId={null} configAtivaId={null} onSalvarForma={onSalvarForma} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();
        fireEvent.click(screen.getByText('EDITAR'));

        const input = screen.getByDisplayValue('0');
        fireEvent.change(input, { target: { value: '80' } });

        fireEvent.click(screen.getByText(/SALVAR FORMA NO COMPÊNDIO/i));

        expect(onSalvarForma).toHaveBeenCalledTimes(1);
        const formaSalva = onSalvarForma.mock.calls[0][0];
        expect(formaSalva.maestria).toBe(80);
    });

    it('digitar um valor acima de 100 é clampado para 100 antes de salvar', () => {
        const onSalvarForma = vi.fn();
        const forma = { id: 'f1', nome: 'Forma Base', maestria: 0, configs: [] };
        render(<FormasEditor formas={[forma]} formaAtivaId={null} configAtivaId={null} onSalvarForma={onSalvarForma} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();
        fireEvent.click(screen.getByText('EDITAR'));

        const input = screen.getByDisplayValue('0');
        fireEvent.change(input, { target: { value: '150' } });

        // O clamp já é aplicado no próprio onChange — o valor exibido reflete 100 imediatamente.
        expect(screen.getByDisplayValue('100')).toBeDefined();

        fireEvent.click(screen.getByText(/SALVAR FORMA NO COMPÊNDIO/i));
        expect(onSalvarForma.mock.calls[0][0].maestria).toBe(100);
    });

    it('digitar um valor negativo é clampado para 0 antes de salvar', () => {
        const onSalvarForma = vi.fn();
        const forma = { id: 'f1', nome: 'Forma Base', maestria: 40, configs: [] };
        render(<FormasEditor formas={[forma]} formaAtivaId={null} configAtivaId={null} onSalvarForma={onSalvarForma} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();
        fireEvent.click(screen.getByText('EDITAR'));

        const input = screen.getByDisplayValue('40');
        fireEvent.change(input, { target: { value: '-20' } });

        expect(screen.getByDisplayValue('0')).toBeDefined();

        fireEvent.click(screen.getByText(/SALVAR FORMA NO COMPÊNDIO/i));
        expect(onSalvarForma.mock.calls[0][0].maestria).toBe(0);
    });
});

describe('FormasEditor - Badge "🥋 X% Maestria" na lista somente-leitura', () => {
    it('exibe o badge de Maestria quando a Forma tem maestria > 0', () => {
        const forma = { id: 'f1', nome: 'Forma Dourada', maestria: 42, configs: [] };
        render(<FormasEditor formas={[forma]} formaAtivaId={null} configAtivaId={null} onSalvarForma={vi.fn()} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();

        expect(screen.getByText(/42% Maestria/)).toBeDefined();
    });

    it('NÃO exibe o badge de Maestria quando a Forma tem maestria=0', () => {
        const forma = { id: 'f1', nome: 'Forma Crua', maestria: 0, configs: [] };
        render(<FormasEditor formas={[forma]} formaAtivaId={null} configAtivaId={null} onSalvarForma={vi.fn()} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();

        expect(screen.queryByText(/Maestria/)).toBeNull();
    });

    it('NÃO exibe o badge de Maestria quando a Forma não tem o campo maestria (legada/undefined)', () => {
        const forma = { id: 'f1', nome: 'Forma Legada', configs: [] };
        render(<FormasEditor formas={[forma]} formaAtivaId={null} configAtivaId={null} onSalvarForma={vi.fn()} onDeletarForma={vi.fn()} onAtivarForma={vi.fn()} />);
        abrirPainel();

        expect(screen.queryByText(/Maestria/)).toBeNull();
    });
});
