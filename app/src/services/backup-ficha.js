// ==========================================
// 💾 BACKUP DA FICHA NA NUVEM — uma cópia por dia (e uma "antes de importar") em mesas/<mesa>/backups/<nome>/<chave>, com um índice
// pequeno em mesas/<mesa>/backupsIndice/<nome>/<chave> para listar e podar sem baixar as fichas. Sobrevive a apagar o personagem
// (nada aqui é mexido por deletarPersonagem). A cópia sai do que veio DO SERVIDOR (não da memória do app), sem imagens gigantes.
// As regras do Firebase precisam liberar esse caminho: ver firebase-regras-backups.md.
// ==========================================
import { ref, set, get, remove } from 'firebase/database';
import { db } from './firebase-config';
import useStore, { sanitizarNome } from '../stores/useStore';
import { dataDeHoje, chaveAntesDeImportar, prepararBackup, chavesParaPodar, ehFichaPlausivel } from '../core/backupFicha';

function caminhos(nome) {
    const { mesaId } = useStore.getState();
    const n = sanitizarNome(nome || '');
    if (!db || !mesaId || !n) return null;
    return { base: `mesas/${mesaId}/backups/${n}`, indice: `mesas/${mesaId}/backupsIndice/${n}` };
}

async function lerIndice(c) {
    const snap = await get(ref(db, c.indice));
    const v = snap.exists() ? snap.val() : {};
    return v && typeof v === 'object' ? v : {};
}

// Grava a cópia `chave` e poda as mais antigas. Devolve { ok, chave, imagensRemovidas } ou { ok:false, erro }.
async function gravar(c, chave, ficha) {
    const { ficha: copia, imagensRemovidas } = prepararBackup(ficha);
    await set(ref(db, `${c.base}/${chave}`), copia);
    await set(ref(db, `${c.indice}/${chave}`), { em: Date.now(), imagensRemovidas });
    // A poda é um extra: se falhar, o backup já foi gravado e isso não pode atrapalhar quem chamou (ex.: a importação).
    try {
        const indice = await lerIndice(c);
        const velhas = chavesParaPodar(Object.keys(indice));
        await Promise.all(velhas.flatMap(k => [remove(ref(db, `${c.base}/${k}`)), remove(ref(db, `${c.indice}/${k}`))]));
    } catch (e) { /* sem poda desta vez */ }
    return { ok: true, chave, imagensRemovidas };
}

// Tira o backup de HOJE se ainda não existe. `fichaDaNuvem` = o que o servidor acabou de mandar (primeira leitura da sessão).
// Nunca lança: devolve { ok:false, erro } e a tela só mostra o estado.
export async function garantirBackupDiario(nome, fichaDaNuvem, agora = new Date()) {
    try {
        const c = caminhos(nome);
        if (!c) return { ok: false, erro: 'sem-mesa' };
        if (!ehFichaPlausivel(fichaDaNuvem)) return { ok: false, erro: 'ficha-pequena-demais' };
        const hoje = dataDeHoje(agora);
        const indice = await lerIndice(c);
        if (indice[hoje]) return { ok: true, chave: hoje, jaExistia: true };
        return await gravar(c, hoje, fichaDaNuvem);
    } catch (e) {
        return { ok: false, erro: (e && e.code) || (e && e.message) || 'falhou' };
    }
}

// Guarda a ficha ATUAL antes de substituí-la por uma importada/restaurada. Devolve { ok, chave } ou { ok:false, erro }.
export async function backupAntesDeImportar(nome, ficha, agora = new Date()) {
    try {
        const c = caminhos(nome);
        if (!c) return { ok: false, erro: 'sem-mesa' };
        return await gravar(c, chaveAntesDeImportar(agora), ficha);
    } catch (e) {
        return { ok: false, erro: (e && e.code) || (e && e.message) || 'falhou' };
    }
}

// Lista os backups do personagem, do mais novo para o mais antigo: [{ chave, em }]. Falha = { ok:false } (não lança).
export async function listarBackups(nome) {
    try {
        const c = caminhos(nome);
        if (!c) return { ok: false, erro: 'sem-mesa', itens: [] };
        const indice = await lerIndice(c);
        const itens = Object.keys(indice).sort().reverse().map(chave => ({ chave, em: Number(indice[chave] && indice[chave].em) || 0 }));
        return { ok: true, itens };
    } catch (e) {
        return { ok: false, erro: (e && e.code) || 'falhou', itens: [] };
    }
}

export async function lerBackup(nome, chave) {
    try {
        const c = caminhos(nome);
        if (!c || !chave) return null;
        const snap = await get(ref(db, `${c.base}/${chave}`));
        return snap.exists() ? snap.val() : null;
    } catch (e) {
        return null;
    }
}
