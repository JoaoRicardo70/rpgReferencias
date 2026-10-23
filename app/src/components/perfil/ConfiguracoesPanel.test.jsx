import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ConfiguracoesPanel from './ConfiguracoesPanel';
import useStore from '../../stores/useStore';

beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    document.documentElement.style.zoom = '';
    useStore.setState({ modoNavegacao: 'orbe', abaAtiva: 'aba-Ficha Def' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.className = ''; document.documentElement.style.zoom = ''; });

const config = () => JSON.parse(localStorage.getItem('rpg_config'));
const atalhos = () => JSON.parse(localStorage.getItem('rpg_atalhos'));
const botaoBusca = () => screen.getByRole('button', { name: /Alterar o atalho: Abrir a busca/ });
const tecla = (init) => fireEvent.keyDown(window, init);

describe('ConfiguracoesPanel - estrutura', () => {
    it('renderiza as secoes Volume, Teclas de atalho, Tela e Aparencia', () => {
        render(<ConfiguracoesPanel />);
        expect(screen.getByText(/Configurações/, { selector: 'h2' })).toBeTruthy();
        expect(screen.getByText(/Volume/, { selector: 'h3' })).toBeTruthy();
        expect(screen.getByText(/Teclas de atalho/, { selector: 'h3' })).toBeTruthy();
        expect(screen.getByText(/Tela/, { selector: 'h3' })).toBeTruthy();
        expect(screen.getByText('Estilo visual')).toBeTruthy();
    });
    it('aplica className extra', () => {
        const { container } = render(<ConfiguracoesPanel className="extra" />);
        expect(container.firstChild.className).toContain('config-panel');
        expect(container.firstChild.className).toContain('extra');
    });
    it('mostra os valores padrao', () => {
        render(<ConfiguracoesPanel />);
        expect(screen.getByLabelText('Vozes dos jogadores').value).toBe('100');
        expect(screen.getByLabelText('Música (Jukebox)').value).toBe('60');
        expect(screen.getByLabelText('Tamanho da interface').value).toBe('100');
        expect(botaoBusca().textContent).toBe('Ctrl + K');
    });
    it('lista as 4 acoes de atalho', () => {
        const { container } = render(<ConfiguracoesPanel />);
        expect(container.querySelectorAll('.config-atalho')).toHaveLength(4);
    });
});

describe('ConfiguracoesPanel - volumes', () => {
    it('slider de vozes grava em rpg_config', () => {
        render(<ConfiguracoesPanel />);
        const s = screen.getByLabelText('Vozes dos jogadores');
        fireEvent.change(s, { target: { value: '35' } });
        expect(config().volumeVozes).toBe(35);
        expect(s.value).toBe('35');
    });
    it('slider da Sexta-Feira grava volumeSexta sem mexer em vozes', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.change(screen.getByLabelText('Voz da Sexta-Feira'), { target: { value: '20' } });
        expect(config().volumeSexta).toBe(20);
        expect(config().volumeVozes).toBe(100);
    });
    it('slider de musica grava rpg_volume_musica', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.change(screen.getByLabelText('Música (Jukebox)'), { target: { value: '15' } });
        expect(localStorage.getItem('rpg_volume_musica')).toBe('15');
    });
    it('carrega valores salvos', () => {
        localStorage.setItem('rpg_config', JSON.stringify({ volumeVozes: 12 }));
        localStorage.setItem('rpg_volume_musica', '77');
        render(<ConfiguracoesPanel />);
        expect(screen.getByLabelText('Vozes dos jogadores').value).toBe('12');
        expect(screen.getByLabelText('Música (Jukebox)').value).toBe('77');
    });
    it('botao Testar nao quebra sem speechSynthesis', () => {
        render(<ConfiguracoesPanel />);
        expect(() => fireEvent.click(screen.getByText(/Testar/))).not.toThrow();
    });
});

describe('ConfiguracoesPanel - atalhos', () => {
    it('capturar novo atalho para Abrir a busca salva em rpg_atalhos', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        expect(botaoBusca().textContent).toMatch(/Aperte a nova combinação/);
        tecla({ key: 'j', code: 'KeyJ', ctrlKey: true });
        expect(atalhos()).toEqual({ paleta: 'Ctrl+J' });
        expect(botaoBusca().textContent).toBe('Ctrl + J');
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('Esc cancela a captura sem salvar', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        tecla({ key: 'Escape', code: 'Escape' });
        expect(localStorage.getItem('rpg_atalhos')).toBeNull();
        expect(botaoBusca().textContent).toBe('Ctrl + K');
    });
    it('depois de cancelar, teclas nao sao mais capturadas', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        tecla({ key: 'Escape', code: 'Escape' });
        tecla({ key: 'j', code: 'KeyJ', ctrlKey: true });
        expect(localStorage.getItem('rpg_atalhos')).toBeNull();
    });
    it('clicar de novo no botao cancela a captura', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        fireEvent.click(botaoBusca());
        expect(botaoBusca().textContent).toBe('Ctrl + K');
    });
    it('so modificador pressionado continua esperando', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        tecla({ key: 'Control', code: 'ControlLeft', ctrlKey: true });
        expect(botaoBusca().textContent).toMatch(/Aperte/);
        expect(localStorage.getItem('rpg_atalhos')).toBeNull();
    });
    it('tecla sem modificador mostra aviso e nao salva', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        tecla({ key: 'j', code: 'KeyJ' });
        expect(screen.getByRole('alert').textContent).toMatch(/Ctrl ou Alt/);
        expect(localStorage.getItem('rpg_atalhos')).toBeNull();
        expect(botaoBusca().textContent).toMatch(/Aperte/);
    });
    it('atalho em conflito mostra aviso e nao salva', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        tecla({ key: 'l', code: 'KeyL', altKey: true });
        const aviso = screen.getByRole('alert');
        expect(aviso.textContent).toMatch(/já é de/);
        expect(aviso.textContent).toMatch(/Livro de Combate/);
        expect(localStorage.getItem('rpg_atalhos')).toBeNull();
    });
    it('conflito com Alt+numero (aba) mostra aviso', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        tecla({ key: '3', code: 'Digit3', altKey: true });
        expect(screen.getByRole('alert').textContent).toMatch(/já é de/);
    });
    it('a captura impede o evento de chegar a outros ouvintes', () => {
        const outro = vi.fn();
        document.addEventListener('keydown', outro);
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        fireEvent.keyDown(document.body, { key: 'j', code: 'KeyJ', ctrlKey: true });
        document.removeEventListener('keydown', outro);
        expect(outro).not.toHaveBeenCalled();
    });
    it('remove o ouvinte de teclado ao desmontar', () => {
        const rem = vi.spyOn(window, 'removeEventListener');
        const { unmount } = render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        unmount();
        expect(rem.mock.calls.some(c => c[0] === 'keydown' && c[2] === true)).toBe(true);
    });
    it('select de modificador das abas grava', () => {
        render(<ConfiguracoesPanel />);
        const sel = screen.getByLabelText(/Ir direto para a aba/);
        expect(sel.value).toBe('Alt');
        fireEvent.change(sel, { target: { value: 'Ctrl+Shift' } });
        expect(atalhos().abas).toBe('Ctrl+Shift');
    });
    it('select das abas em conflito mostra aviso e volta ao valor anterior', () => {
        localStorage.setItem('rpg_atalhos', JSON.stringify({ paleta: 'Ctrl+5' }));
        render(<ConfiguracoesPanel />);
        const sel = screen.getByLabelText(/Ir direto para a aba/);
        fireEvent.change(sel, { target: { value: 'Ctrl' } });
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(atalhos().abas).toBeUndefined();
        expect(sel.value).toBe('Alt');
    });
    it('Restaurar atalhos padrao limpa o storage e volta o texto', () => {
        localStorage.setItem('rpg_atalhos', JSON.stringify({ paleta: 'Ctrl+J' }));
        render(<ConfiguracoesPanel />);
        expect(botaoBusca().textContent).toBe('Ctrl + J');
        fireEvent.click(screen.getByText(/Restaurar atalhos padrão/));
        expect(localStorage.getItem('rpg_atalhos')).toBeNull();
        expect(botaoBusca().textContent).toBe('Ctrl + K');
    });
    it('Restaurar atalhos tambem limpa aviso e captura', () => {
        render(<ConfiguracoesPanel />);
        fireEvent.click(botaoBusca());
        tecla({ key: 'j', code: 'KeyJ' });
        expect(screen.getByRole('alert')).toBeTruthy();
        fireEvent.click(screen.getByText(/Restaurar atalhos padrão/));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(botaoBusca().textContent).toBe('Ctrl + K');
    });
});

describe('ConfiguracoesPanel - tela', () => {
    it('checkbox Reduzir animacoes grava e aplica classe no body', () => {
        render(<ConfiguracoesPanel />);
        const cb = screen.getByLabelText(/Reduzir animações/);
        expect(cb.checked).toBe(false);
        fireEvent.click(cb);
        expect(config().reduzirAnimacoes).toBe(true);
        expect(cb.checked).toBe(true);
        expect(document.body.classList.contains('reduzir-animacoes')).toBe(true);
        fireEvent.click(cb);
        expect(config().reduzirAnimacoes).toBe(false);
        expect(document.body.classList.contains('reduzir-animacoes')).toBe(false);
    });
    it('slider de tamanho aplica zoom e grava', () => {
        render(<ConfiguracoesPanel />);
        const s = screen.getByLabelText('Tamanho da interface');
        expect(s.min).toBe('80');
        expect(s.max).toBe('130');
        fireEvent.change(s, { target: { value: '120' } });
        expect(config().tamanhoInterface).toBe(120);
        expect(document.documentElement.style.zoom).toBe('1.2');
    });
});

describe('ConfiguracoesPanel - restaurar tudo', () => {
    const preparar = () => {
        localStorage.setItem('rpg_config', JSON.stringify({ volumeVozes: 10, tamanhoInterface: 120, reduzirAnimacoes: true }));
        localStorage.setItem('rpg_atalhos', JSON.stringify({ paleta: 'Ctrl+J' }));
        localStorage.setItem('rpg_volume_musica', '10');
        localStorage.setItem('rpg_tema', 'theme-medieval');
    };
    it('confirmando, volta tudo ao padrao e mantem o tema', () => {
        preparar();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<ConfiguracoesPanel />);
        fireEvent.click(screen.getByText(/Restaurar configurações/));
        expect(localStorage.getItem('rpg_config')).toBeNull();
        expect(localStorage.getItem('rpg_atalhos')).toBeNull();
        expect(localStorage.getItem('rpg_volume_musica')).toBe('60');
        expect(localStorage.getItem('rpg_tema')).toBe('theme-medieval');
        expect(screen.getByLabelText('Vozes dos jogadores').value).toBe('100');
        expect(screen.getByLabelText('Música (Jukebox)').value).toBe('60');
        expect(screen.getByLabelText('Tamanho da interface').value).toBe('100');
        expect(screen.getByLabelText(/Reduzir animações/).checked).toBe(false);
        expect(botaoBusca().textContent).toBe('Ctrl + K');
        expect(document.documentElement.style.zoom).toBe('');
        expect(document.body.classList.contains('reduzir-animacoes')).toBe(false);
    });
    it('cancelando a confirmacao nada muda', () => {
        preparar();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<ConfiguracoesPanel />);
        fireEvent.click(screen.getByText(/Restaurar configurações/));
        expect(config().volumeVozes).toBe(10);
        expect(atalhos().paleta).toBe('Ctrl+J');
        expect(localStorage.getItem('rpg_volume_musica')).toBe('10');
    });
});
