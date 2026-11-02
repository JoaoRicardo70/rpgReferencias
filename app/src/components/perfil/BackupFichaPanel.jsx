import React, { useState, useEffect, useCallback, useRef } from 'react';
import useStore from '../../stores/useStore';
import { salvarFirebaseImediato, remotoConfirmado } from '../../services/firebase-sync';
import { listarBackups, lerBackup, backupAntesDeImportar } from '../../services/backup-ficha';
import {
    montarArquivoExportacao, nomeDoArquivo, lerArquivoImportacao, resumoDaFicha, descreverResumo, pareceFichaMenor, rotuloDoBackup, ehFichaPlausivel,
    prepararBackup, preservarImagensAtuais, LIMITE_ARQUIVO_BYTES
} from '../../core/backupFicha';

// 💾 Backup da ficha: baixar a ficha em arquivo (.json), importar um arquivo e restaurar uma das cópias diárias guardadas na nuvem.
// Substituir a ficha sempre guarda antes uma cópia da atual na nuvem; o app só envia depois de sincronizar com o servidor.
export default function BackupFichaPanel() {
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);
    const carregarDadosFicha = useStore(s => s.carregarDadosFicha);
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const [backups, setBackups] = useState({ carregando: true, ok: true, itens: [] });
    const [ocupado, setOcupado] = useState(false);
    const entradaArquivo = useRef(null);

    const atualizarLista = useCallback(async () => {
        if (!meuNome) { setBackups({ carregando: false, ok: true, itens: [] }); return; }
        setBackups(b => ({ ...b, carregando: true }));
        const r = await listarBackups(meuNome);
        setBackups({ carregando: false, ok: r.ok, itens: r.itens || [], erro: r.erro });
    }, [meuNome]);

    useEffect(() => { atualizarLista(); }, [atualizarLista]);

    const exportar = useCallback(() => {
        if (!minhaFicha || !meuNome) return;
        if (!remotoConfirmado()) adicionarAviso('A ficha ainda não sincronizou com o servidor: o arquivo pode estar desatualizado.', 'alerta');
        try {
            const arquivo = montarArquivoExportacao(minhaFicha, meuNome);
            const blob = new Blob([JSON.stringify(arquivo)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nomeDoArquivo(meuNome);
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            adicionarAviso(`Ficha exportada (${nomeDoArquivo(meuNome)}).`, 'info');
        } catch (e) {
            adicionarAviso('Não consegui gerar o arquivo da ficha.', 'alerta');
        }
    }, [minhaFicha, meuNome, adicionarAviso]);

    // Substitui a ficha atual por `nova`, depois de confirmar e de guardar uma cópia da atual na nuvem.
    // Ainda é o MESMO personagem (e mesa) de quando a ação começou? Uma troca no meio de um await não pode gravar a ficha no personagem errado.
    const mesmoPersonagem = useCallback((nome, mesa) => {
        const e = useStore.getState();
        return e.meuNome === nome && e.mesaId === mesa;
    }, []);

    const substituirFicha = useCallback(async (nova, origem, { eRestauracao = false } = {}) => {
        if (!ehFichaPlausivel(nova)) { adicionarAviso('Esse conteúdo não parece uma ficha deste app.', 'alerta'); return; }
        if (!remotoConfirmado()) { adicionarAviso('Espere a ficha sincronizar com o servidor antes de importar/restaurar.', 'alerta'); return; }
        const mesaInicial = useStore.getState().mesaId;
        const nomeInicial = meuNome;
        // Backup da nuvem deixa de fora imagens embutidas gigantes: restaurar mantém as atuais, e a cópia "antes" não as tem.
        const imagensForaDoBackup = prepararBackup(minhaFicha).imagensRemovidas;
        const fichaNova = eRestauracao ? preservarImagensAtuais(nova, minhaFicha) : nova;
        const atual = resumoDaFicha(minhaFicha);
        const novo = resumoDaFicha(fichaNova);
        let texto = `Substituir a ficha ATUAL de ${meuNome} (${descreverResumo(atual)}) por ${origem} (${descreverResumo(novo)})?\n\nUma cópia da ficha atual será guardada na nuvem antes. Campos que não existirem na ficha nova ficam como estão hoje.`;
        if (pareceFichaMenor(minhaFicha, fichaNova)) texto += '\n\n⚠️ A ficha nova parece BEM MENOR que a atual. Confira se é a certa.';
        if (imagensForaDoBackup > 0) texto += `\n\n⚠️ ${imagensForaDoBackup} imagem(ns) embutida(s) grande(s) da ficha atual NÃO entram na cópia da nuvem. Exporte a ficha para um arquivo antes, se quiser guardá-las.`;
        if (!window.confirm(texto)) return;
        setOcupado(true);
        try {
            const copia = await backupAntesDeImportar(meuNome, minhaFicha);
            if (!copia.ok) {
                adicionarAviso('Não consegui guardar uma cópia da ficha atual na nuvem (talvez falte liberar o caminho nas regras do Firebase: firebase-regras-backups.md), então NÃO substituí nada. Exporte a atual para um arquivo e tente de novo.', 'alerta');
                return;
            }
            if (!mesmoPersonagem(nomeInicial, mesaInicial) || !remotoConfirmado()) {
                adicionarAviso('Você trocou de personagem ou de mesa durante a operação, então NÃO substituí nada.', 'alerta');
                return;
            }
            const paraCarregar = JSON.parse(JSON.stringify(fichaNova));
            // O dono da ficha é sempre o da ficha atual (um arquivo de outra conta não pode trocar o dono).
            if (minhaFicha && minhaFicha.donoDaFicha) paraCarregar.donoDaFicha = minhaFicha.donoDaFicha;
            carregarDadosFicha(paraCarregar);
            try { await salvarFirebaseImediato(); } catch (e) { adicionarAviso('A ficha foi trocada aqui, mas o envio ao servidor falhou. Tente salvar de novo.', 'alerta'); return; }
            adicionarAviso(`Ficha substituída por ${origem}. A anterior ficou guardada nos backups.`, 'info');
            atualizarLista();
        } finally {
            setOcupado(false);
        }
    }, [minhaFicha, meuNome, carregarDadosFicha, adicionarAviso, atualizarLista, mesmoPersonagem]);

    const aoEscolherArquivo = useCallback(async (e) => {
        const arquivo = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!arquivo) return;
        if (arquivo.size > LIMITE_ARQUIVO_BYTES) { adicionarAviso('Arquivo grande demais para ser uma ficha (limite de 5 MB).', 'alerta'); return; }
        let texto = '';
        try { texto = await arquivo.text(); } catch (err) { adicionarAviso('Não consegui ler o arquivo.', 'alerta'); return; }
        const lido = lerArquivoImportacao(texto);
        if (!lido.ok) { adicionarAviso(lido.erro, 'alerta'); return; }
        const quando = lido.exportadoEm ? ` de ${new Date(lido.exportadoEm).toLocaleString('pt-BR')}` : '';
        const deOutro = lido.nome && lido.nome !== meuNome ? ` (arquivo do personagem "${lido.nome}")` : '';
        await substituirFicha(lido.ficha, `o arquivo${quando}${deOutro}`);
    }, [substituirFicha, adicionarAviso, meuNome]);

    const restaurar = useCallback(async (chave) => {
        setOcupado(true);
        const mesaInicial = useStore.getState().mesaId;
        let ficha = null;
        try { ficha = await lerBackup(meuNome, chave); } finally { setOcupado(false); }
        if (!mesmoPersonagem(meuNome, mesaInicial)) { adicionarAviso('Você trocou de personagem ou de mesa durante a leitura do backup, então NÃO restaurei nada.', 'alerta'); return; }
        if (!ficha) { adicionarAviso('Não consegui ler esse backup.', 'alerta'); return; }
        await substituirFicha(ficha, `o backup de ${rotuloDoBackup(chave)}`, { eRestauracao: true });
    }, [meuNome, substituirFicha, adicionarAviso, mesmoPersonagem]);

    return (
        <div className="def-box backup-ficha">
            <h3 style={{ color: '#ffcc00', marginBottom: 10 }}>💾 Backup da ficha</h3>
            <p className="backup-ficha-dica">
                O app guarda uma cópia por dia na nuvem (últimos dias) e você pode baixar a ficha em um arquivo. Para qualquer ficha perdida, restaure uma cópia abaixo.
            </p>
            <div className="backup-ficha-botoes">
                <button type="button" className="btn-neon btn-blue" onClick={exportar} disabled={!minhaFicha || ocupado}>⬇️ Exportar ficha (.json)</button>
                <button type="button" className="btn-neon btn-gold" onClick={() => entradaArquivo.current && entradaArquivo.current.click()} disabled={ocupado}>⬆️ Importar ficha</button>
                <input ref={entradaArquivo} type="file" accept="application/json,.json" onChange={aoEscolherArquivo} style={{ display: 'none' }} aria-label="Arquivo da ficha para importar" />
            </div>
            <h4 className="backup-ficha-subtitulo">Cópias automáticas na nuvem</h4>
            {backups.carregando && <p className="backup-ficha-dica">Carregando...</p>}
            {!backups.carregando && !backups.ok && <p className="backup-ficha-erro">Não consegui ler os backups da nuvem (sem conexão ou sem permissão nas regras do Firebase).</p>}
            {!backups.carregando && backups.ok && backups.itens.length === 0 && <p className="backup-ficha-dica">Ainda não há cópias. A primeira é feita na próxima vez que a ficha sincronizar.</p>}
            <ul className="backup-ficha-lista">
                {backups.itens.map(b => (
                    <li key={b.chave}>
                        <span>{rotuloDoBackup(b.chave)}</span>
                        <button type="button" className="btn-neon btn-small" onClick={() => restaurar(b.chave)} disabled={ocupado} aria-label={`Restaurar o backup de ${rotuloDoBackup(b.chave)}`}>Restaurar</button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
