import { initPlasmicLoader } from '@plasmicapp/loader-react'

// --- Componentes puros (sem dependência de store) ---
import VitalBar from './components/status/VitalBar'
import TabPanel from './components/layout/TabPanel'
import FormasEditor from './components/shared/FormasEditor'
import TemaSelector from './components/shared/TemaSelector'
import TemaEditor from './components/shared/TemaEditor'

// --- Wrappers para componentes com store ---
import {
  PlasmicAppShell,
  PlasmicStatusPanel,
  PlasmicFichaPanel,
  PlasmicAtaquePanel,
  PlasmicAcertoPanel,
  PlasmicDefesaPanel,
  PlasmicTestesPanel,
  PlasmicPoderesPanel,
  PlasmicArsenalPanel,
  PlasmicElementosPanel,
  PlasmicFeedCombate,
  PlasmicMapaPanel,
  PlasmicPerfilPanel,
  PlasmicModalConfirm,
  PlasmicCompendioPanel,
  PlasmicNarrativaPanel,
  PlasmicJukebox,
  PlasmicSidebar,
  PlasmicMestrePanel,
  PlasmicTabelaPrestigio,
  PlasmicRadarChart,
  PlasmicAtributosLista,
  // Ficha sub-componentes
  PlasmicFichaBioGroup,
  PlasmicFichaEditorAtributos,
  PlasmicFichaReatorElemental,
  PlasmicFichaDistorcaoConceitual,
  PlasmicFichaMatrizUtilitaria,
  PlasmicFichaFuriaBerserker,
  PlasmicFichaMarcadoresCena,
  PlasmicFichaForjaCalamidade,
  PlasmicFichaMultiplicadoresDano,
  // Ataque sub-componentes
  PlasmicAtaqueFuriaDisplay,
  PlasmicAtaqueCriticoConfig,
  PlasmicAtaqueArmaEquipada,
  PlasmicAtaqueHabilidadesAtivas,
  PlasmicAtaqueMagiasPreparadas,
  PlasmicAtaqueBotoesAcao,
  // Defesa sub-componentes
  PlasmicDefesaEvasaoBox,
  PlasmicDefesaResistenciaBox,
  PlasmicDefesaEscudoBox,
  // Status sub-componentes
  PlasmicStatusVitalsGrid,
  PlasmicStatusEnergiasPrimordiais,
  PlasmicStatusMultiplicadores,
  PlasmicStatusEconomiaAcoes,
  PlasmicStatusControleRapido,
  PlasmicStatusAnalisePoder,
  PlasmicStatusPaletaCores
} from './plasmic-wrappers.jsx'

if (!import.meta.env.VITE_PLASMIC_PROJECT_ID) {
  console.warn('[Plasmic] VITE_PLASMIC_PROJECT_ID não definido. Configure no arquivo .env')
}

export const PLASMIC = initPlasmicLoader({
  projects: [
    {
      id: import.meta.env.VITE_PLASMIC_PROJECT_ID || '',
      token: import.meta.env.VITE_PLASMIC_PUBLIC_TOKEN || ''
    }
  ],
  preview: import.meta.env.DEV
})

// ========================================
// LAYOUT COMPLETO (AppShell)
// ========================================

PLASMIC.registerComponent(PlasmicAppShell, {
  name: 'AppShell',
  props: {
    className: 'string',
    abaInicial: {
      type: 'choice',
      options: [
        'aba-perfil', 'aba-mestre', 'aba-status', 'aba-testes',
        'aba-ataque', 'aba-acerto', 'aba-defesa', 'aba-ficha',
        'aba-poderes', 'aba-arsenal', 'aba-elementos', 'aba-log',
        'aba-mapa', 'aba-musica', 'aba-compendio', 'aba-oraculo', 'aba-gravador'
      ],
      defaultValue: 'aba-status',
      displayName: 'Aba visível no editor'
    },
    painelPerfil: 'slot',
    painelMestre: 'slot',
    painelStatus: 'slot',
    painelTestes: 'slot',
    painelAtaque: 'slot',
    painelAcerto: 'slot',
    painelDefesa: 'slot',
    painelFicha: 'slot',
    painelPoderes: 'slot',
    painelArsenal: 'slot',
    painelElementos: 'slot',
    painelLog: 'slot',
    painelMapa: 'slot',
    painelMusica: 'slot',
    painelCompendio: 'slot',
    painelOraculo: 'slot',
    painelGravador: 'slot'
  }
})

// ========================================
// COMPONENTES PUROS (sem store)
// ========================================

PLASMIC.registerComponent(VitalBar, {
  name: 'VitalBar',
  props: {
    className: 'string',
    label: 'string',
    atual: 'number',
    max: 'number',
    color: 'string',
    extraInfo: 'string'
  }
})

PLASMIC.registerComponent(TabPanel, {
  name: 'TabPanel',
  props: {
    className: 'string',
    id: 'string',
    children: 'slot'
  }
})

PLASMIC.registerComponent(FormasEditor, {
  name: 'FormasEditor',
  props: {
    className: 'string',
    itemRaridade: 'string',
    formas: 'object',
    formaAtivaId: 'string',
    configAtivaId: 'string',
    onSalvarForma: { type: 'eventHandler', argTypes: [] },
    onDeletarForma: { type: 'eventHandler', argTypes: [] },
    onAtivarForma: { type: 'eventHandler', argTypes: [] }
  }
})

PLASMIC.registerComponent(TemaSelector, {
  name: 'TemaSelector',
  props: {
    className: 'string'
  }
})

PLASMIC.registerComponent(TemaEditor, {
  name: 'TemaEditor',
  props: {
    className: 'string',
    nomeTema: 'string',
    emoji: 'string',
    corPrimaria: 'string',
    corPrimariaRgb: 'string',
    corSecundaria: 'string',
    corSecundariaRgb: 'string',
    corDestaque: 'string',
    corDestaqueRgb: 'string',
    bgBody1: 'string',
    bgBody2: 'string',
    bgPanel: 'string',
    borderPrimary: 'string',
    gridColor: 'string',
    shadowPrimary: 'string'
  }
})

// ========================================
// SUB-COMPONENTES GRANULARES (status)
// ========================================

PLASMIC.registerComponent(PlasmicRadarChart, {
  name: 'RadarChart',
  props: {
    className: 'string',
    isAtual: 'boolean'
  }
})

PLASMIC.registerComponent(PlasmicAtributosLista, {
  name: 'AtributosLista',
  props: {
    className: 'string',
    isAtual: 'boolean'
  }
})

// ========================================
// PAINÉIS COMPLETOS (com store via wrapper)
// ========================================

PLASMIC.registerComponent(PlasmicStatusPanel, {
  name: 'StatusPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicFichaPanel, {
  name: 'FichaPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicTabelaPrestigio, {
  name: 'TabelaPrestigio',
  props: { className: 'string' }
})

PLASMIC.registerComponent(PlasmicAtaquePanel, {
  name: 'AtaquePanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicAcertoPanel, {
  name: 'AcertoPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicDefesaPanel, {
  name: 'DefesaPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicTestesPanel, {
  name: 'TestesPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicPoderesPanel, {
  name: 'PoderesPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicArsenalPanel, {
  name: 'ArsenalPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicElementosPanel, {
  name: 'ElementosPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicFeedCombate, {
  name: 'FeedCombate',
  props: { className: 'string' }
})

PLASMIC.registerComponent(PlasmicMapaPanel, {
  name: 'MapaPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicPerfilPanel, {
  name: 'PerfilPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicModalConfirm, {
  name: 'ModalConfirm',
  props: { className: 'string' }
})

PLASMIC.registerComponent(PlasmicCompendioPanel, {
  name: 'CompendioPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicNarrativaPanel, {
  name: 'NarrativaPanel',
  props: { className: 'string', children: 'slot' }
})

PLASMIC.registerComponent(PlasmicJukebox, {
  name: 'Jukebox',
  props: { className: 'string' }
})

PLASMIC.registerComponent(PlasmicSidebar, {
  name: 'Sidebar',
  props: { className: 'string' }
})

PLASMIC.registerComponent(PlasmicMestrePanel, {
  name: 'MestrePanel',
  props: { className: 'string', children: 'slot' }
})

// ========================================
// SUB-COMPONENTES INDIVIDUAIS
// ========================================

// --- Ficha ---
PLASMIC.registerComponent(PlasmicFichaBioGroup, {
  name: 'FichaBioGroup',
  props: { className: 'string' },
  parentComponentName: 'FichaPanel'
})
PLASMIC.registerComponent(PlasmicFichaEditorAtributos, {
  name: 'FichaEditorAtributos',
  props: { className: 'string' },
  parentComponentName: 'FichaPanel'
})
PLASMIC.registerComponent(PlasmicFichaReatorElemental, {
  name: 'FichaReatorElemental',
  props: { className: 'string' },
  parentComponentName: 'FichaPanel'
})
PLASMIC.registerComponent(PlasmicFichaDistorcaoConceitual, {
  name: 'FichaDistorcaoConceitual',
  props: { className: 'string' },
  parentComponentName: 'FichaPanel'
})
PLASMIC.registerComponent(PlasmicFichaMatrizUtilitaria, {
  name: 'FichaMatrizUtilitaria',
  props: { className: 'string' },
  parentComponentName: 'FichaPanel'
})
PLASMIC.registerComponent(PlasmicFichaFuriaBerserker, {
  name: 'FichaFuriaBerserker',
  props: { className: 'string' },
  parentComponentName: 'FichaPanel'
})
PLASMIC.registerComponent(PlasmicFichaMarcadoresCena, {
  name: 'FichaMarcadoresCena',
  props: { className: 'string' },
  parentComponentName: 'FichaPanel'
})
PLASMIC.registerComponent(PlasmicFichaForjaCalamidade, {
  name: 'FichaForjaCalamidade',
  props: { className: 'string' },
  parentComponentName: 'FichaPanel'
})
PLASMIC.registerComponent(PlasmicFichaMultiplicadoresDano, {
  name: 'FichaMultiplicadoresDano',
  props: { className: 'string' },
  parentComponentName: 'FichaPanel'
})

// --- Ataque ---
PLASMIC.registerComponent(PlasmicAtaqueFuriaDisplay, {
  name: 'AtaqueFuriaDisplay',
  props: { className: 'string' },
  parentComponentName: 'AtaquePanel'
})
PLASMIC.registerComponent(PlasmicAtaqueCriticoConfig, {
  name: 'AtaqueCriticoConfig',
  props: { className: 'string' },
  parentComponentName: 'AtaquePanel'
})
PLASMIC.registerComponent(PlasmicAtaqueArmaEquipada, {
  name: 'AtaqueArmaEquipada',
  props: { className: 'string' },
  parentComponentName: 'AtaquePanel'
})
PLASMIC.registerComponent(PlasmicAtaqueHabilidadesAtivas, {
  name: 'AtaqueHabilidadesAtivas',
  props: { className: 'string' },
  parentComponentName: 'AtaquePanel'
})
PLASMIC.registerComponent(PlasmicAtaqueMagiasPreparadas, {
  name: 'AtaqueMagiasPreparadas',
  props: { className: 'string' },
  parentComponentName: 'AtaquePanel'
})
PLASMIC.registerComponent(PlasmicAtaqueBotoesAcao, {
  name: 'AtaqueBotoesAcao',
  props: { className: 'string' },
  parentComponentName: 'AtaquePanel'
})

// --- Defesa ---
PLASMIC.registerComponent(PlasmicDefesaEvasaoBox, {
  name: 'DefesaEvasaoBox',
  props: { className: 'string' },
  parentComponentName: 'DefesaPanel'
})
PLASMIC.registerComponent(PlasmicDefesaResistenciaBox, {
  name: 'DefesaResistenciaBox',
  props: { className: 'string' },
  parentComponentName: 'DefesaPanel'
})
PLASMIC.registerComponent(PlasmicDefesaEscudoBox, {
  name: 'DefesaEscudoBox',
  props: { className: 'string' },
  parentComponentName: 'DefesaPanel'
})

// --- Status ---
PLASMIC.registerComponent(PlasmicStatusPaletaCores, {
  name: 'StatusPaletaCores',
  props: { className: 'string' },
  parentComponentName: 'StatusPanel'
})
PLASMIC.registerComponent(PlasmicStatusVitalsGrid, {
  name: 'StatusVitalsGrid',
  props: { className: 'string' },
  parentComponentName: 'StatusPanel'
})
PLASMIC.registerComponent(PlasmicStatusEnergiasPrimordiais, {
  name: 'StatusEnergiasPrimordiais',
  props: { className: 'string' },
  parentComponentName: 'StatusPanel'
})
PLASMIC.registerComponent(PlasmicStatusMultiplicadores, {
  name: 'StatusMultiplicadores',
  props: { className: 'string' },
  parentComponentName: 'StatusPanel'
})
PLASMIC.registerComponent(PlasmicStatusEconomiaAcoes, {
  name: 'StatusEconomiaAcoes',
  props: { className: 'string' },
  parentComponentName: 'StatusPanel'
})
PLASMIC.registerComponent(PlasmicStatusControleRapido, {
  name: 'StatusControleRapido',
  props: { className: 'string' },
  parentComponentName: 'StatusPanel'
})
PLASMIC.registerComponent(PlasmicStatusAnalisePoder, {
  name: 'StatusAnalisePoder',
  props: { className: 'string' },
  parentComponentName: 'StatusPanel'
})
