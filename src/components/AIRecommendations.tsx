'use client'
import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// ---- Static data ----

interface ExperimentSummary {
  title: string
  description: string
  cbda: string
  cbga: string
  olivetol: string
  olivetolicAcid: string
  thca: string
  ethanol: string
  diauxicShift: string
  highlight?: string
}

interface Hypothesis {
  id: number
  title: string
  description: string
  confidence: number
}

interface RecommendedExperiment {
  id: string
  title: string
  objective: string
  strainModification: string
  conditions: string
  controlBaseline: string
  expectedOutcome: string
}

const RECENT_EXPERIMENTS: ExperimentSummary[] = [
  {
    title: 'Ferm 122-BM',
    description: '20 g/L sucrose + 0.5 g/L YE5 + 0.5 g/L PM feeds, strain 3732, pH 4.5-5, 26C, DO 30%->10%, Antifoam C',
    cbda: '1,722.6', cbga: '629.3', olivetol: '421.7', olivetolicAcid: '148.5', thca: '201.8', ethanol: '7.38', diauxicShift: '13.28 h',
    highlight: 'Highest CBDa titre in the set',
  },
  {
    title: 'Ferm 122-BP',
    description: '20 g/L sucrose + 0.5 g/L YE5 + 0.5 g/L PM feeds, strain 3732, pH 4.5-5, 26C, DO 30%->10%, Antifoam C',
    cbda: '1,668.5', cbga: '647.3', olivetol: '406.3', olivetolicAcid: '157.1', thca: '194.5', ethanol: '6.81', diauxicShift: '13.11 h',
  },
  {
    title: 'Ferm 122-BO',
    description: '20 g/L sucrose + 0.5 g/L YE5 + 0.5 g/L PM feeds, strain 3732, pH 4.5-5, 26C, DO 30%->10%, Antifoam C',
    cbda: '1,630.1', cbga: '652.7', olivetol: '353.1', olivetolicAcid: '138.9', thca: '183.9', ethanol: '8.27', diauxicShift: '11.81 h',
  },
  {
    title: 'Ferm 122-BA',
    description: '10 g/L sucrose + 0.25 g/L YE5 + 0.25 g/L PM feeds (lower feed), strain 3732, pH 4.5-5, 26C, DO 30%->10%, Antifoam C',
    cbda: '1,624.6', cbga: '576.9', olivetol: '443.7', olivetolicAcid: '298.0', thca: '200.2', ethanol: '5.71', diauxicShift: '13.02 h',
    highlight: 'Half-rate feed — similar CBDa but highest olivetol/OA accumulation',
  },
  {
    title: 'Ferm 122-BC',
    description: '20 g/L sucrose + 0.5 g/L YE5 + 0.5 g/L PM feeds, strain 3732, pH 4.5-5, 26C, DO 30%->10%, Antifoam C',
    cbda: '1,268.8', cbga: '339.7', olivetol: '301.1', olivetolicAcid: '153.7', thca: '145.6', ethanol: '10.71', diauxicShift: '11.67 h',
    highlight: 'Lowest CBDa — high residual sucrose and ethanol suggests overfeeding',
  },
  {
    title: 'Ferm 122-BS',
    description: 'No data recorded — likely a blank or control vessel.',
    cbda: '0.0', cbga: '0.0', olivetol: '0.0', olivetolicAcid: '0.0', thca: '0.0', ethanol: '0.0', diauxicShift: 'N/A',
  },
]

const HYPOTHESES: Hypothesis[] = [
  { id: 1, title: 'Insufficient flux of Malonyl-CoA into DiPKS', description: 'Malonyl-CoA is the primary substrate for DiPKS and is consumed by competing pathways including fatty acid synthesis. High olivetol and olivetolic acid accumulation in recent runs (e.g. 443.7 mg/L olivetol in Ferm 122-BA) suggests DiPKS is active but downstream conversion may be substrate-limited. Overexpression of ACC1 or redirection of malonyl-CoA away from lipid biosynthesis could confirm this bottleneck.', confidence: 85 },
  { id: 2, title: 'Toxicity of DiPKS is limiting cell growth', description: 'DiPKS is a heterologous polyketide synthase that could impose a metabolic burden or produce toxic intermediates. However, cell growth across FERM 122 runs appeared healthy with consistent diauxic shifts (11.7-13.3 h) and no anomalies flagged. Current data does not strongly support DiPKS toxicity as a primary limiter.', confidence: 72 },
  { id: 3, title: 'Toxicity of one or more cannabinoids is limiting cell growth', description: 'CBDa and CBGa accumulation above 1,500 mg/L combined could exert membrane stress or inhibit key enzymes. Ferm 122-BM reached 1,722.6 mg/L CBDa + 629.3 mg/L CBGa — at these concentrations, product toxicity may begin to cap further titre gains.', confidence: 58 },
  { id: 4, title: 'Insufficient flux of GPP into the pathway', description: 'Geranyl pyrophosphate (GPP) is required for the prenylation step catalyzed by CsPT4 to convert olivetolic acid to CBGa. The ratio of olivetolic acid to CBGa varies across runs, with BA showing 298.0 mg/L OA vs 576.9 mg/L CBGa, suggesting potential GPP limitation under certain conditions.', confidence: 41 },
  { id: 5, title: 'Redox insufficiency', description: 'The cannabinoid pathway requires significant NADPH input across multiple enzymatic steps. High ethanol accumulation in underperforming runs (10.71 g/L in Ferm 122-BC) may indicate redox imbalance where overflow metabolism diverts carbon away from NADPH-generating pathways.', confidence: 27 },
]

const RECOMMENDATIONS: { banner: string; bannerDetail: string; experiments: RecommendedExperiment[] } = {
  banner: 'Based on top hypothesis: Insufficient flux of Malonyl-CoA into DiPKS',
  bannerDetail: 'Three experiments designed to test and address the malonyl-CoA bottleneck — from genetic engineering to rapid chemical validation.',
  experiments: [
    {
      id: 'REC-1', title: 'ACC1 Overexpression — Boost Malonyl-CoA Supply',
      objective: 'Test whether overexpressing acetyl-CoA carboxylase (ACC1) increases malonyl-CoA availability and drives higher flux through DiPKS, leading to increased CBDa titres.',
      strainModification: 'Integrate a constitutive ACC1 overexpression cassette (pTDH3-ACC1) into strain 3732. Use the ACC1-S659A/S1157A phosphorylation-resistant mutant to bypass Snf1 kinase regulation.',
      conditions: 'Mirror Ferm 122-BM conditions: 1,500 mL, 30 g/L glucose batch, 20 g/L sucrose + 0.5 g/L YE5 + 0.5 g/L PM feeds, pH 4.5-5, 26C, DO 30%->10%, Antifoam C. Run 3 biological replicates.',
      controlBaseline: 'Ferm 122-BM (strain 3732 unmodified) — 1,722.6 mg/L CBDa, 421.7 mg/L olivetol.',
      expectedOutcome: 'If malonyl-CoA is the bottleneck, expect >15% increase in CBDa titre with a corresponding decrease in olivetol accumulation.',
    },
    {
      id: 'REC-2', title: 'FAS1/FAS2 Knockdown — Redirect Malonyl-CoA Away from Fatty Acid Synthesis',
      objective: 'Reduce competing malonyl-CoA consumption by fatty acid synthase, freeing substrate for DiPKS without requiring additional ACC1 copies.',
      strainModification: 'Replace native FAS1 promoter with a weaker constitutive promoter (pREV1 or pCYC1) in strain 3732. Supplement media with 1 g/L oleic acid + 0.5 g/L palmitic acid.',
      conditions: 'Same as Ferm 122-BM baseline. 3 biological replicates.',
      controlBaseline: 'Ferm 122-BM — 1,722.6 mg/L CBDa. Monitor cell viability closely.',
      expectedOutcome: 'Expect increased CBDa and CBGa titres with potential growth penalty. If olivetol decreases while CBDa increases, confirms malonyl-CoA redirection is effective.',
    },
    {
      id: 'REC-3', title: 'Cerulenin Pulse — Chemical Validation of Malonyl-CoA Bottleneck',
      objective: 'Use a small-molecule fatty acid synthase inhibitor (cerulenin) to chemically phenocopy the FAS knockdown and validate the malonyl-CoA hypothesis without strain engineering.',
      strainModification: 'None — use unmodified strain 3732.',
      conditions: 'Same as Ferm 122-BM baseline. Add cerulenin at 3 concentrations (5, 10, 20 uM) at the start of fed-batch phase (~13 h). Include untreated control. Supplement with 1 g/L oleic acid. 2 replicates per condition.',
      controlBaseline: 'Ferm 122-BM — 1,722.6 mg/L CBDa.',
      expectedOutcome: 'Dose-dependent increase in CBDa titre at 5-10 uM cerulenin would strongly confirm malonyl-CoA as the primary bottleneck. At 20 uM, growth inhibition may offset gains.',
    },
  ],
}

// ---- Helpers ----

function confidenceColor(confidence: number): string {
  if (confidence >= 70) return 'text-green-700 bg-green-100'
  if (confidence >= 40) return 'text-yellow-700 bg-yellow-100'
  return 'text-red-700 bg-red-100'
}

// ---- Panels ----

function RecentResultsPanel() {
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-4 pb-2">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-gray-800">
          <p className="font-semibold text-blue-900 mb-2">FERM 122 Set — Overall Conclusions</p>
          <p className="mb-2">
            All 6 vessels used strain 3732 with a glucose batch phase followed by sucrose fed-batch at 26C, pH 4.5-5, with DO stepping from 30% to 10% post-batch. The set tested two feed concentrations: a standard rate and a half rate.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Best performer:</strong> Ferm 122-BM at 1,722.6 mg/L CBDa with clean metabolite profiles.</li>
            <li><strong>Half-rate feed (BA):</strong> Comparable CBDa (1,624.6 mg/L) but significantly higher olivetol (443.7) and olivetolic acid (298.0) accumulation.</li>
            <li><strong>Underperformer (BC):</strong> 1,268.8 mg/L CBDa with high residual sucrose and ethanol (10.71 g/L).</li>
            <li><strong>Diauxic shifts:</strong> Ranged from 11.67-13.28 h. Earlier shifts correlated with lower final titres.</li>
            <li><strong>CBGa ranged</strong> 340-653 mg/L; THCa was consistent at 146-202 mg/L across productive runs.</li>
          </ul>
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={() => setIsDetailOpen(!isDetailOpen)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 mb-3"
        >
          {isDetailOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Individual Experiment Details ({RECENT_EXPERIMENTS.length})
        </button>
        {isDetailOpen && (
          <div className="space-y-3">
            {RECENT_EXPERIMENTS.map((exp) => (
              <div key={exp.title} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-semibold text-sm text-gray-900">{exp.title}</h4>
                  {exp.highlight && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">{exp.highlight}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-2">{exp.description}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-gray-400">CBDa:</span> <span className="font-medium">{exp.cbda}</span></div>
                  <div><span className="text-gray-400">CBGa:</span> <span className="font-medium">{exp.cbga}</span></div>
                  <div><span className="text-gray-400">Olivetol:</span> <span className="font-medium">{exp.olivetol}</span></div>
                  <div><span className="text-gray-400">OA:</span> <span className="font-medium">{exp.olivetolicAcid}</span></div>
                  <div><span className="text-gray-400">THCa:</span> <span className="font-medium">{exp.thca}</span></div>
                  <div><span className="text-gray-400">EtOH:</span> <span className="font-medium">{exp.ethanol}</span></div>
                  <div><span className="text-gray-400">Diauxic:</span> <span className="font-medium">{exp.diauxicShift}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function HypothesisPanel() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-4 pb-4">
        <p className="text-sm font-semibold text-gray-900 mb-3">Current Hypotheses</p>
        <div className="space-y-3">
          {HYPOTHESES.map((h) => (
            <div key={h.id} className="flex items-start gap-3 border border-gray-200 rounded-lg p-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center mt-0.5">
                {h.id}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{h.title}</p>
                <p className="text-xs text-gray-500 mt-1">{h.description}</p>
              </div>
              <span className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${confidenceColor(h.confidence)}`}>
                {h.confidence}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RecommendationsPanel() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-4 pb-2">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-gray-800 mb-4">
          <p className="font-semibold text-green-900">{RECOMMENDATIONS.banner} (85% confidence)</p>
          <p className="text-xs text-green-700 mt-1">{RECOMMENDATIONS.bannerDetail}</p>
        </div>
      </div>
      <div className="px-4 pb-4 space-y-4">
        {RECOMMENDATIONS.experiments.map((exp) => (
          <div key={exp.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{exp.id}</span>
              <h4 className="font-semibold text-sm text-gray-900">{exp.title}</h4>
            </div>
            <p className="text-xs text-gray-600 mb-3">{exp.objective}</p>
            <div className="space-y-2 text-xs">
              <div><span className="font-medium text-gray-700">Strain modification: </span><span className="text-gray-600">{exp.strainModification}</span></div>
              <div><span className="font-medium text-gray-700">Conditions: </span><span className="text-gray-600">{exp.conditions}</span></div>
              <div><span className="font-medium text-gray-700">Control baseline: </span><span className="text-gray-600">{exp.controlBaseline}</span></div>
              <div><span className="font-medium text-gray-700">Expected outcome: </span><span className="text-gray-600">{exp.expectedOutcome}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Main component ----

const TABS = ['recent-results', 'hypothesis', 'recommendations'] as const
const TAB_LABELS: Record<string, string> = {
  'recent-results': 'Recent Results',
  hypothesis: 'Hypothesis',
  recommendations: 'Experiment Recommendations',
}

export function AIRecommendations() {
  const [activeTab, setActiveTab] = useState<string>('recent-results')

  return (
    <div className="flex flex-col h-[540px]">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setActiveTab(tabKey)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tabKey
                ? 'border-b-2 border-gray-500 text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[tabKey]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'recent-results' ? (
        <RecentResultsPanel />
      ) : activeTab === 'hypothesis' ? (
        <HypothesisPanel />
      ) : (
        <RecommendationsPanel />
      )}
    </div>
  )
}

export default AIRecommendations
