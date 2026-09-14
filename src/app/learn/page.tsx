'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import BrandLogo from '@/components/BrandLogo';
import { useMembershipGate } from '@/lib/membership';

// NOTE: Mixing, compounding, and reconstitution guidance has been removed.
// This app must not provide compounding guidance — patients must follow only
// their prescriber's instructions. Dose ranges remain strictly as
// non-actionable educational reference.
// Educational reference only. We intentionally do NOT publish numeric dose
// ranges here — dosing must come from the patient's prescriber. For FDA-
// approved drugs we include a link to the official prescribing information
// via DailyMed so users can self-serve the authoritative source.
const DOSE_PLACEHOLDER = 'Consult your prescriber for dosing';

interface Peptide {
  id: string;
  name: string;
  otherNames: string[];
  category: string;
  mechanism: string;
  sideEffects: string[];
  approval: string;
  status: 'Available' | 'Research';
  efficacy: string;
  doseRange: string;
  fdaLabelUrl: string | null;
  investigational: boolean;
  overview: string;
  education: string[];
}

const peptides: Peptide[] = [
  {
    id: 'tirzepatide',
    name: 'Tirzepatide',
    otherNames: ['Mounjaro', 'Zepbound'],
    category: 'Dual GLP-1/GIP Agonist',
    mechanism: 'Activates GIP and GLP-1 receptors, which can improve glucose-dependent insulin signaling, reduce appetite, and slow gastric emptying.',
    sideEffects: ['Nausea', 'Diarrhea', 'Vomiting', 'Constipation'],
    approval: 'FDA Approved (2022)',
    status: 'Available',
    efficacy: 'Large clinical trials show clinically meaningful weight loss and A1C reduction in indicated patients.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=tirzepatide',
    investigational: false,
    overview: 'Tirzepatide is a prescription incretin medication used for type 2 diabetes and chronic weight management under specific FDA-approved brands and indications. It is often discussed with peptides because it is a peptide-based receptor agonist, but it should be treated as a regulated medication rather than a wellness supplement.',
    education: [
      'Its dual-receptor activity may enhance satiety signals, reduce food cravings, and improve how the body handles glucose after meals.',
      'Common tolerability issues are gastrointestinal and are usually managed by the prescribing clinician through screening, monitoring, and individualized adjustments.',
      'Patients with a history of pancreatitis, gallbladder disease, severe gastrointestinal disease, pregnancy, or certain endocrine cancer risks should discuss those factors with a licensed clinician.',
    ],
  },
  {
    id: 'semaglutide',
    name: 'Semaglutide',
    otherNames: ['Ozempic', 'Wegovy', 'Rybelsus'],
    category: 'GLP-1 Agonist',
    mechanism: 'Activates GLP-1 receptors to increase glucose-dependent insulin release, reduce glucagon, slow gastric emptying, and support satiety.',
    sideEffects: ['Nausea', 'Vomiting', 'Diarrhea', 'Headache'],
    approval: 'FDA Approved (2017)',
    status: 'Available',
    efficacy: 'Clinical trials support use for glycemic control and, under specific brands, chronic weight management.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=semaglutide',
    investigational: false,
    overview: 'Semaglutide is a prescription GLP-1 receptor agonist available in different FDA-approved products for type 2 diabetes and chronic weight management. Because products, routes, and indications differ, patients should rely on their own prescription label and clinician instructions.',
    education: [
      'The medication works through appetite and glucose-regulation pathways rather than stimulant effects.',
      'Nausea, reflux, constipation, diarrhea, and reduced appetite are among the most commonly discussed side effects.',
      'Medical supervision is important for people taking insulin or sulfonylureas, people with kidney stress from dehydration, and anyone with severe abdominal pain or persistent vomiting.',
    ],
  },
  {
    id: 'cagrilinitide',
    name: 'Cagrilintide',
    otherNames: ['CagriSema'],
    category: 'Amylin Analog',
    mechanism: 'Works synergistically with GLP-1 agonists for enhanced satiety and reduced food intake',
    sideEffects: ['Nausea', 'Injection site reactions'],
    approval: 'Phase 3 Trials',
    status: 'Research',
    efficacy: '15% weight loss',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Cagrilintide is an investigational amylin analog being studied for weight management, often in combination with GLP-1 pathway medications. It is not an FDA-approved medication.',
    education: [
      'Amylin signaling may support fullness, reduce meal size, and complement incretin-based approaches.',
      'Published use remains clinical-trial focused, so benefits and risks should not be generalized to unsupervised use.',
      'Patients should avoid treating investigational trial results as personal treatment guidance.',
    ],
  },
  {
    id: 'survodutide',
    name: 'Survodutide',
    otherNames: ['BI 456906'],
    category: 'Dual GLP-1/Glucagon',
    mechanism: 'Increases energy expenditure through glucagon receptor activation while GLP-1 reduces appetite',
    sideEffects: ['Nausea', 'Vomiting', 'Diarrhea'],
    approval: 'Phase 3 Trials',
    status: 'Research',
    efficacy: '18% weight loss',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Survodutide is an investigational peptide receptor agonist being studied for metabolic disease and weight management. It is not FDA approved.',
    education: [
      'Its GLP-1 activity is intended to affect appetite and glucose regulation, while glucagon receptor activity is being studied for effects on energy balance.',
      'Gastrointestinal side effects are common in this drug class and require careful trial monitoring.',
      'Any use outside a clinical trial should be discussed with a licensed clinician because safety and effectiveness are still being established.',
    ],
  },
  {
    id: 'nad',
    name: 'NAD+',
    otherNames: ['Nicotinamide adenine dinucleotide', 'NMN', 'Nicotinamide mononucleotide'],
    category: 'Cellular Metabolism',
    mechanism: 'Supports cellular redox reactions and enzymes involved in energy metabolism, DNA repair signaling, and stress-response pathways.',
    sideEffects: ['Flushing', 'Nausea', 'Headache', 'Fatigue'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Human evidence varies by formulation and route; claims about anti-aging benefits remain investigational.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'NAD+ is a naturally occurring coenzyme found in cells, not a peptide. It is included here because many longevity clinics discuss NAD+ or NAD+ precursors alongside peptide programs.',
    education: [
      'NAD+ participates in mitochondrial energy production and in sirtuin and PARP-related cellular repair pathways.',
      'Levels may change with age, illness, sleep disruption, and metabolic stress, but raising a biomarker does not automatically prove clinical benefit.',
      'People should be cautious with broad claims about detoxification, anti-aging, or neurologic benefits unless those claims are tied to high-quality clinical evidence.',
    ],
  },
  {
    id: 'tesamorelin',
    name: 'Tesamorelin',
    otherNames: ['Egrifta', 'Egrifta SV', 'Egrifta WR'],
    category: 'Growth Hormone Releasing',
    mechanism: 'Acts as a growth hormone-releasing hormone analog that stimulates the pituitary to release growth hormone and increase IGF-1.',
    sideEffects: ['Injection site redness', 'Water retention', 'Joint pain', 'Glucose changes'],
    approval: 'FDA Approved (2010)',
    status: 'Available',
    efficacy: 'FDA approved to reduce excess abdominal fat in adults with HIV-associated lipodystrophy.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=tesamorelin',
    investigational: false,
    overview: 'Tesamorelin is a prescription GHRH analog with a specific FDA-approved indication related to HIV-associated lipodystrophy. It is not a general weight-loss medication and is not appropriate for every patient with abdominal fat.',
    education: [
      'By increasing growth hormone signaling, tesamorelin can influence visceral adipose tissue, IGF-1 levels, fluid balance, and glucose metabolism.',
      'Clinician monitoring is important because growth hormone pathways can affect edema, joint symptoms, carpal tunnel symptoms, and blood sugar.',
      'People with active malignancy, pregnancy considerations, pituitary-axis disorders, or diabetes risk need individualized medical review.',
    ],
  },
  {
    id: 'pt141',
    name: 'PT-141',
    otherNames: ['Bremelanotide', 'Vyleesi'],
    category: 'Melanocortin Receptor Agonist',
    mechanism: 'Activates melanocortin receptors in pathways involved in sexual desire and central nervous system signaling.',
    sideEffects: ['Nausea', 'Flushing', 'Headache', 'Blood pressure increase'],
    approval: 'FDA Approved for a specific sexual desire disorder indication',
    status: 'Available',
    efficacy: 'Evidence supports a specific prescription indication; broader wellness claims are not established.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=bremelanotide',
    investigational: false,
    overview: 'PT-141 is the development name for bremelanotide, a prescription medication approved for certain premenopausal women with acquired, generalized hypoactive sexual desire disorder. It is not a general libido enhancer and is not approved for every sexual-function concern.',
    education: [
      'Unlike drugs that act primarily on blood flow, bremelanotide acts through central melanocortin signaling.',
      'Blood pressure and heart-rate effects are clinically relevant and should be reviewed before use.',
      'Evaluation of relationship factors, mental health, medications, hormones, and cardiovascular risk is part of responsible care.',
    ],
  },
  {
    id: 'thymosin-alpha-1',
    name: 'Thymosin Alpha 1',
    otherNames: ['TA1', 'Thymalfasin', 'Zadaxin'],
    category: 'Immune Modulating Peptide',
    mechanism: 'Modulates T-cell, dendritic-cell, and cytokine signaling involved in immune surveillance and inflammatory balance.',
    sideEffects: ['Injection site reactions', 'Fatigue', 'Headache'],
    approval: 'Not FDA approved; approved for some indications in certain non-US countries',
    status: 'Research',
    efficacy: 'Studied in immune, viral, and oncology-adjacent settings; US clinical use remains investigational.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Thymosin Alpha 1 is a thymic peptide fragment studied for immune modulation. It should not be presented as an immune booster or a substitute for vaccines, antivirals, cancer therapy, or treatment of autoimmune disease.',
    education: [
      'Research focuses on how it may influence T-cell maturation, antigen presentation, and immune-response coordination.',
      'Immune-modulating therapies can have different implications for people with autoimmune disease, transplants, cancer, or chronic infections.',
      'Patients should discuss any immune-directed peptide with a clinician who understands their diagnosis, medications, and lab history.',
    ],
  },
  {
    id: 'sermorelin',
    name: 'Sermorelin',
    otherNames: ['GHRH 1-29'],
    category: 'Growth Hormone Releasing',
    mechanism: 'Acts as a growth hormone-releasing hormone analog that stimulates pituitary growth hormone release when the axis is responsive.',
    sideEffects: ['Injection site reactions', 'Flushing', 'Headache', 'Dizziness'],
    approval: 'Previously marketed; not currently a broadly available FDA-approved brand product',
    status: 'Research',
    efficacy: 'Evidence is strongest for diagnostic or endocrine contexts; anti-aging claims are not established.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Sermorelin is a shortened GHRH analog discussed for growth-hormone-axis evaluation and off-label wellness settings. Any use should be supervised because growth hormone pathways affect more than body composition.',
    education: [
      'It depends on pituitary responsiveness and differs from directly giving growth hormone.',
      'Clinicians may monitor IGF-1, glucose status, edema, sleep apnea risk, and symptoms of excessive growth hormone signaling.',
      'It should not be used to promise anti-aging, muscle gain, or fat loss outcomes without a diagnosis-based medical rationale.',
    ],
  },
  {
    id: 'glutathione',
    name: 'Glutathione',
    otherNames: ['GSH', 'Reduced glutathione'],
    category: 'Antioxidant Support',
    mechanism: 'Functions as a major intracellular antioxidant involved in redox balance, detoxification pathways, and recycling of other antioxidants.',
    sideEffects: ['Bloating', 'Cramping', 'Allergic reactions', 'Bronchospasm risk in susceptible patients'],
    approval: 'Research / supplement context; not FDA approved for broad wellness claims',
    status: 'Research',
    efficacy: 'Biologic role is well established; clinical benefits depend on condition, route, and evidence quality.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Glutathione is a naturally occurring tripeptide made from glutamate, cysteine, and glycine. It is often marketed for antioxidant, liver, skin, and recovery support, but many claims exceed the available clinical evidence.',
    education: [
      'It helps cells manage oxidative stress and supports conjugation reactions used to process certain compounds.',
      'Low glutathione status can be associated with illness or oxidative burden, but supplementation is not automatically indicated for every patient.',
      'People with asthma, medication interactions, pregnancy considerations, or complex liver disease should seek medical guidance before use.',
    ],
  },
  {
    id: 'l-carnitine',
    name: 'L-Carnitine',
    otherNames: ['Levocarnitine'],
    category: 'Mitochondrial Fatty Acid Transport',
    mechanism: 'Transports long-chain fatty acids into mitochondria for beta-oxidation and helps buffer acyl groups in energy metabolism.',
    sideEffects: ['Nausea', 'GI upset', 'Fishy body odor', 'Seizure risk in susceptible patients'],
    approval: 'FDA approved for specific carnitine deficiency indications; wellness use varies',
    status: 'Available',
    efficacy: 'Helpful for documented deficiency; body composition and performance claims are mixed.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=levocarnitine',
    investigational: false,
    overview: 'L-Carnitine is not a peptide; it is a nutrient-derived compound involved in mitochondrial fatty-acid transport. Prescription levocarnitine exists for specific deficiency states, while wellness use requires more careful interpretation.',
    education: [
      'Carnitine status can matter in certain genetic, kidney, medication-related, or nutritional contexts.',
      'It should not be framed as a stand-alone fat-loss therapy because energy balance, diet quality, activity, sleep, and medical conditions remain central.',
      'Patients with seizure history, kidney disease, thyroid treatment, or anticoagulant use should discuss risks with a clinician.',
    ],
  },
  {
    id: 'vitamin-b12',
    name: 'Vitamin B12',
    otherNames: ['Cobalamin', 'Methylcobalamin', 'Cyanocobalamin'],
    category: 'Vitamin / Methylation Support',
    mechanism: 'Supports red blood cell production, neurologic function, DNA synthesis, and methylation reactions.',
    sideEffects: ['Injection site reactions', 'Acneiform rash', 'Diarrhea', 'Rare allergic reaction'],
    approval: 'FDA approved products exist for deficiency-related indications',
    status: 'Available',
    efficacy: 'Effective for B12 deficiency; benefits are less clear when levels are already adequate.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=cyanocobalamin',
    investigational: false,
    overview: 'Vitamin B12 is included because it is commonly offered with peptide and metabolic programs. It is an essential vitamin, not a peptide, and the strongest rationale is correction or prevention of deficiency.',
    education: [
      'Deficiency can contribute to anemia, neuropathy, cognitive symptoms, fatigue, and elevated methylmalonic acid or homocysteine.',
      'Risk can be higher with vegan diets, bariatric surgery, pernicious anemia, metformin, acid-suppressing medications, and some gastrointestinal disorders.',
      'Testing and follow-up help distinguish true deficiency from nonspecific fatigue or wellness claims.',
    ],
  },
  {
    id: 'mic',
    name: 'MIC',
    otherNames: ['Methionine-Inositol-Choline', 'Lipotropic injection'],
    category: 'Lipotropic Nutrient Blend',
    mechanism: 'Combines nutrients involved in methylation, phospholipid metabolism, and hepatic fat handling.',
    sideEffects: ['Injection site reactions', 'GI upset', 'Headache'],
    approval: 'Not FDA approved as a standardized weight-loss drug',
    status: 'Research',
    efficacy: 'Evidence for direct weight-loss effects is limited; benefits depend on nutrition status and overall care plan.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'MIC is not a peptide; it is a compounded-style nutrient blend typically containing methionine, inositol, and choline. It is often marketed for liver or fat metabolism support, but it should not be described as a proven weight-loss medication.',
    education: [
      'Methionine is an essential amino acid, inositol participates in cell signaling, and choline supports phospholipid and methyl-donor pathways.',
      'The concept of "lipotropic" support is biologically plausible, but clinical outcomes are not comparable to FDA-approved obesity medications.',
      'Patients with liver disease, bipolar disorder, pregnancy considerations, or complex supplement regimens should review ingredients with a clinician.',
    ],
  },
  {
    id: 'bpc157',
    name: 'BPC-157',
    otherNames: ['Body Protection Compound-157'],
    category: 'Healing Peptide',
    mechanism: 'Studied for effects on angiogenesis, nitric-oxide signaling, inflammatory balance, and tissue repair pathways in preclinical models.',
    sideEffects: ['Injection site reactions', 'Unknown long-term safety', 'Potential immunogenicity concerns'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Preclinical evidence is prominent; high-quality human evidence is limited.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'BPC-157 is a synthetic peptide fragment often marketed for tendon, ligament, muscle, and gut healing. It is not FDA approved, and FDA has identified safety and quality concerns for compounded products containing BPC-157.',
    education: [
      'Most supportive data come from animal or laboratory models, so human benefit should be described cautiously.',
      'Claims about rapid injury repair, pain relief, or gastrointestinal healing should not replace diagnosis, imaging, rehabilitation, or standard medical care.',
      'Because peptide quality, sterility, impurities, and immune reactions matter, unsupervised sourcing carries meaningful risk.',
    ],
  },
  {
    id: 'tb500',
    name: 'TB-500',
    otherNames: ['Thymosin Beta-4 fragment', 'TB4 fragment'],
    category: 'Recovery Peptide',
    mechanism: 'Modeled on thymosin beta-4 biology, including actin regulation, cell migration, angiogenesis, and inflammatory signaling.',
    sideEffects: ['Headache', 'Flushing', 'Injection site reactions', 'Unknown long-term safety'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Mostly preclinical and sports-medicine-adjacent claims; human evidence is limited.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'TB-500 is commonly discussed as a repair or recovery peptide related to thymosin beta-4 fragments. It is not FDA approved and should not be positioned as a proven treatment for musculoskeletal injuries.',
    education: [
      'The rationale centers on cell movement, actin dynamics, blood-vessel formation, and inflammatory resolution observed in experimental systems.',
      'Injury care still requires appropriate diagnosis, load management, physical therapy, and medical evaluation when pain, weakness, swelling, or loss of function persists.',
      'Product identity can be confusing because "TB-500" may refer to fragments rather than full thymosin beta-4, which matters for interpreting research.',
    ],
  },
  {
    id: 'll37',
    name: 'LL-37',
    otherNames: ['Cathelicidin LL-37'],
    category: 'Antimicrobial / Immune Peptide',
    mechanism: 'Interacts with microbial membranes and immune signaling pathways involved in host defense and inflammation.',
    sideEffects: ['Injection site reactions', 'Inflammatory reactions', 'Unknown immune effects'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Biologic antimicrobial activity is well described; therapeutic human use remains investigational.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'LL-37 is a human antimicrobial peptide involved in innate immunity. It has been studied in infection, wound, inflammatory, and barrier-function contexts, but it is not an FDA-approved treatment.',
    education: [
      'Its immune effects are complex: the same pathways that may support host defense can also interact with inflammation.',
      'Research interest does not mean it should be used as an antibiotic substitute or as a self-directed immune therapy.',
      'Sterility, immune activation, and patient-specific inflammatory disease history are major safety considerations.',
    ],
  },
  {
    id: 'bpc157-ulcerative-colitis',
    name: 'BPC-157 (Ulcerative colitis)',
    otherNames: ['Body Protection Compound-157'],
    category: 'Gut Barrier / Inflammation Research',
    mechanism: 'Studied in gastrointestinal injury models for mucosal integrity, inflammatory signaling, angiogenesis, and tissue repair.',
    sideEffects: ['Unknown long-term safety', 'Potential immunogenicity concerns', 'Injection site reactions'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Not established for ulcerative colitis treatment in high-quality human trials.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'BPC-157 is sometimes promoted for ulcerative colitis because of preclinical gastrointestinal research. Ulcerative colitis is a chronic immune-mediated disease with risks such as bleeding, anemia, strictures, infection, and cancer surveillance needs, so experimental peptides should not replace gastroenterology care.',
    education: [
      'Standard ulcerative colitis care may include lab monitoring, colonoscopy, anti-inflammatory therapy, immunomodulators, biologics, nutrition support, and flare management.',
      'Symptom improvement does not always equal mucosal healing, which is why objective monitoring matters.',
      'Anyone with rectal bleeding, fever, severe abdominal pain, dehydration, or rapid weight loss needs prompt medical evaluation.',
    ],
  },
  {
    id: 'kpv-wound-healing-inflammation',
    name: 'KPV (Wound healing and inflammation)',
    otherNames: ['Lysine-Proline-Valine', 'alpha-MSH fragment'],
    category: 'Anti-Inflammatory Peptide Research',
    mechanism: 'Derived from alpha-MSH and studied for effects on inflammatory cytokines, immune-cell activity, and epithelial repair.',
    sideEffects: ['Unknown long-term safety', 'Injection site reactions', 'GI upset'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Preclinical and early translational interest; not an FDA-approved wound or inflammatory disease treatment.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'KPV is a short peptide fragment studied for anti-inflammatory signaling and barrier repair. It is often discussed for wounds, gut inflammation, and skin inflammation, but clinical evidence remains limited.',
    education: [
      'The proposed value is modulation of inflammation rather than direct replacement of wound closure, infection control, or surgical care.',
      'Wounds require assessment for blood flow, pressure, infection, diabetes control, nutrition, and mechanical stress.',
      'Inflammatory conditions should be diagnosed before considering experimental therapies because infection and immune disease can look similar.',
    ],
  },
  {
    id: 'tb500-wound-healing',
    name: 'TB-500 (Wound healing)',
    otherNames: ['Thymosin Beta-4 fragment', 'TB4 fragment'],
    category: 'Wound Healing Research',
    mechanism: 'Studied for cell migration, actin regulation, angiogenesis, and tissue remodeling pathways relevant to repair.',
    sideEffects: ['Injection site reactions', 'Headache', 'Unknown long-term safety'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Not established as an FDA-approved wound-healing therapy.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'TB-500 is marketed for healing, but wound repair is a complex clinical process involving oxygenation, circulation, infection control, inflammation, and tissue remodeling. Experimental peptide discussions should stay separate from evidence-based wound care.',
    education: [
      'Delayed healing can reflect diabetes, vascular disease, pressure injury, infection, malnutrition, smoking, medication effects, or immune disease.',
      'Clinical wound care may require debridement, dressings, compression, off-loading, antibiotics, vascular evaluation, or surgical input.',
      'A non-healing wound, spreading redness, fever, drainage, black tissue, or worsening pain warrants urgent medical assessment.',
    ],
  },
  {
    id: 'motsc-obesity-osteoporosis',
    name: 'MOTs-C (Obesity and osteoporosis)',
    otherNames: ['Mitochondrial open reading frame of the 12S rRNA-c'],
    category: 'Mitochondrial-Derived Peptide Research',
    mechanism: 'Studied for AMPK-related metabolic signaling, mitochondrial stress adaptation, insulin sensitivity, and bone-metabolism pathways.',
    sideEffects: ['Unknown long-term safety', 'Injection site reactions', 'Metabolic effects not fully characterized'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Human therapeutic efficacy for obesity or osteoporosis is not established.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'MOTs-C is a mitochondrial-derived peptide being researched for metabolic health, aging biology, exercise adaptation, and bone-related pathways. It should be described as investigational, especially for obesity and osteoporosis.',
    education: [
      'Obesity and osteoporosis have different diagnostic standards and treatment goals; neither should be managed based on peptide marketing claims alone.',
      'Bone health evaluation may include fracture history, DEXA scanning, calcium and vitamin D status, endocrine evaluation, fall risk, and medication review.',
      'Metabolic interventions should prioritize evidence-based nutrition, activity, sleep, medications when indicated, and monitoring of cardiometabolic risk.',
    ],
  },
  {
    id: 'emideltide-dsip',
    name: 'Emideltide / DSIP',
    otherNames: ['Delta sleep-inducing peptide', 'DSIP'],
    category: 'Sleep / Neuroendocrine Peptide Research',
    mechanism: 'Studied for possible effects on sleep regulation, stress-axis signaling, pain modulation, and neuroendocrine rhythms.',
    sideEffects: ['Drowsiness', 'Headache', 'Unknown long-term safety'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Sleep benefits are not established by modern, high-quality clinical evidence.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Emideltide is associated with delta sleep-inducing peptide research. Despite the name, it should not be presented as a proven insomnia treatment or a replacement for sleep-disorder evaluation.',
    education: [
      'Sleep problems may come from apnea, restless legs, circadian rhythm disorders, anxiety, depression, pain, medications, alcohol, or endocrine conditions.',
      'Sedation is not the same as healthy sleep architecture, so subjective sleepiness alone is not enough to prove benefit.',
      'Persistent insomnia should be assessed with attention to behavioral therapy, sleep hygiene, medication review, and safety risks such as drowsy driving.',
    ],
  },
  {
    id: 'semax-cerebral-ischemia-trigeminal-neuralgia',
    name: 'Semax (Cerebral ischemia and trigeminal neuralgia)',
    otherNames: ['ACTH(4-10) analog'],
    category: 'Neuropeptide Research',
    mechanism: 'Studied for neurotrophic, melanocortin-related, inflammatory, and neurotransmitter-modulating effects.',
    sideEffects: ['Nasal irritation', 'Headache', 'Agitation', 'Unknown long-term safety'],
    approval: 'Not FDA approved',
    status: 'Research',
    efficacy: 'Evidence for cerebral ischemia or trigeminal neuralgia is not sufficient for FDA-approved use.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Semax is a synthetic peptide analog researched in neurologic contexts, including cerebral ischemia and pain conditions. Stroke-like symptoms and trigeminal neuralgia require conventional medical evaluation because delays can be dangerous.',
    education: [
      'Cerebral ischemia is a medical emergency when acute; facial droop, arm weakness, speech trouble, vision loss, severe dizziness, or sudden neurologic deficits require emergency care.',
      'Trigeminal neuralgia has established diagnostic pathways and evidence-based medication and procedural options.',
      'Neuroprotective research should not be translated into self-treatment for stroke, transient ischemic attack, or severe facial pain.',
    ],
  },
  {
    id: 'epitalon-insomnia',
    name: 'Epitalon (Insomnia)',
    otherNames: ['Epithalon', 'Ala-Glu-Asp-Gly'],
    category: 'Aging / Sleep Research',
    mechanism: 'Studied for pineal, circadian, antioxidant, and telomerase-related pathways in experimental aging research.',
    sideEffects: ['Unknown long-term safety', 'Headache', 'Injection site reactions'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'Not established as an FDA-approved insomnia treatment.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Epitalon is a synthetic tetrapeptide discussed in aging and circadian-rhythm circles. Insomnia claims should be framed cautiously because clinical sleep medicine relies on diagnosis, behavioral treatment, and targeted therapy.',
    education: [
      'Theoretical links to melatonin or circadian biology do not prove that a peptide corrects insomnia.',
      'Insomnia care often starts with identifying behavioral patterns, medications, mood disorders, apnea, pain, and circadian misalignment.',
      'People should avoid using experimental sleep peptides with sedatives, alcohol, or untreated sleep apnea without medical supervision.',
    ],
  },
  {
    id: 'dihexa',
    name: 'DiHexa',
    otherNames: ['N-hexanoic-Tyr-Ile-(6) aminohexanoic amide', 'Angiotensin IV analog'],
    category: 'Cognitive / Neurotrophic Research',
    mechanism: 'Studied for hepatocyte growth factor/c-Met pathway modulation and synapse-formation signaling in preclinical models.',
    sideEffects: ['Unknown long-term safety', 'Headache', 'Theoretical growth-signaling concerns'],
    approval: 'Research Only',
    status: 'Research',
    efficacy: 'No established FDA-approved cognitive or neurologic indication.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'DiHexa is an experimental compound often discussed for cognition and neurodegenerative disease research. Its proposed growth-factor pathway activity is exactly why cautious wording and clinician oversight are important.',
    education: [
      'Preclinical signals about synapse formation do not establish safety or effectiveness for memory, dementia, traumatic brain injury, or focus.',
      'Cognitive symptoms can reflect sleep disorders, depression, medication effects, thyroid disease, B12 deficiency, infection, neurologic disease, or substance use.',
      'Because c-Met and growth-factor signaling can intersect with cancer biology, broad wellness claims are inappropriate.',
    ],
  },
  {
    id: 'ghkcu-injectable',
    name: 'GHK-Cu (Injectable)',
    otherNames: ['Copper peptide', 'Glycyl-L-histidyl-L-lysine copper'],
    category: 'Skin / Wound Research',
    mechanism: 'Copper-binding peptide studied for extracellular matrix remodeling, collagen signaling, antioxidant activity, and wound repair.',
    sideEffects: ['Injection site reactions', 'Copper-related irritation', 'Unknown systemic safety'],
    approval: 'Research Only for injectable use',
    status: 'Research',
    efficacy: 'Topical cosmetic interest exists; injectable therapeutic claims are investigational.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'GHK-Cu is a naturally occurring copper-binding peptide commonly used in topical skin-care discussions. Injectable GHK-Cu is a different risk category and should be described as investigational.',
    education: [
      'Research interest includes collagen, elastin, glycosaminoglycans, wound remodeling, and antioxidant pathways.',
      'Topical cosmetic tolerability should not be assumed to apply to injections, where sterility, systemic exposure, and copper handling matter.',
      'Patients with wound problems, scarring concerns, or skin disease should consider dermatology or wound-care evaluation before experimental approaches.',
    ],
  },
  {
    id: 'ibutamoren-mesylate',
    name: 'Ibutamoren Mesylate',
    otherNames: ['MK-677', 'Ibutamoren'],
    category: 'Growth Hormone Secretagogue Research',
    mechanism: 'Oral ghrelin receptor agonist that can increase growth hormone and IGF-1 signaling.',
    sideEffects: ['Increased appetite', 'Edema', 'Numbness or tingling', 'Insulin resistance'],
    approval: 'Research Only; not FDA approved',
    status: 'Research',
    efficacy: 'Studied for body composition and frailty-related endpoints; not approved for muscle gain, fat loss, or anti-aging.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Ibutamoren mesylate is not a peptide; it is an oral growth hormone secretagogue commonly grouped with peptide therapies. It requires cautious education because it can affect appetite, glucose metabolism, fluid balance, and IGF-1.',
    education: [
      'Raising growth hormone or IGF-1 is not automatically beneficial and may be risky in people with diabetes risk, sleep apnea, edema, cancer history, or uncontrolled hypertension.',
      'Weight changes can reflect water retention or increased appetite rather than lean-tissue benefit.',
      'Medical monitoring is important if growth-hormone-axis agents are being considered.',
    ],
  },
  {
    id: 'melanotan-ii',
    name: 'Melanotan II',
    otherNames: ['MT-II', 'Melanocortin agonist'],
    category: 'Melanocortin Receptor Agonist',
    mechanism: 'Activates melanocortin receptors involved in pigmentation, appetite, sexual arousal, and autonomic signaling.',
    sideEffects: ['Nausea', 'Flushing', 'Mole darkening', 'Blood pressure changes'],
    approval: 'Research Only; not FDA approved',
    status: 'Research',
    efficacy: 'Not approved for tanning, weight loss, or sexual function.',
    doseRange: DOSE_PLACEHOLDER,
    fdaLabelUrl: null,
    investigational: true,
    overview: 'Melanotan II is an unapproved melanocortin agonist often marketed for tanning or libido. It should be presented with clear caution because pigmentation changes can complicate skin-cancer surveillance and systemic effects are possible.',
    education: [
      'Reported concerns include nausea, flushing, appetite changes, blood pressure effects, spontaneous erections, and changes in moles or pigmentation.',
      'Any changing, bleeding, asymmetric, or rapidly darkening mole should be evaluated by a clinician or dermatologist.',
      'It is not a safe substitute for sun protection, dermatology care, or evidence-based sexual-health evaluation.',
    ],
  },
];

// Compliance: the encyclopedia surfaces ONLY provider-approved peptides — the
// same allow-list the storefront is permitted to carry (see marketplace-access).
// Research-only / non-approved compounds (BPC-157, TB-500, GHK-Cu, Melanotan II,
// cagrilintide, survodutide, L-Carnitine, B12, MIC, etc.) are kept out of the
// app entirely, mirroring the pruned store.
const APPROVED_PEPTIDE_IDS = new Set<string>([
  'semaglutide',
  'tirzepatide',
  'nad',
  'glutathione',
  'tesamorelin',
  'sermorelin',
  'ipamorelin',
  'cjc-1295',
  'enclomiphene',
  'anastrozole',
  'pt141',
  'thymosin-alpha-1',
  'selank',
]);

const visiblePeptides = peptides.filter((p) => APPROVED_PEPTIDE_IDS.has(p.id));

const articles = [
  { id: 1, title: 'Understanding GLP-1 Medications: A Complete Guide', category: 'Education', readTime: '8 min', popular: true, image: '📚' },
  { id: 2, title: 'How Tirzepatide Works: The Science Behind Dual Agonists', category: 'Science', readTime: '7 min', popular: true, image: '🔬' },
  { id: 3, title: 'Managing Side Effects: Tips from Healthcare Providers', category: 'Health', readTime: '5 min', image: '💊' },
  { id: 4, title: 'Tirzepatide vs Semaglutide: Which is Right for You?', category: 'Comparison', readTime: '10 min', popular: true, image: '⚖️' },
];

interface BlogArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  author: string;
  published_at: string;
}

interface BlogsResponse {
  success: boolean;
  data?: { blogs: BlogArticle[] };
}

const categories = ['All', 'Education', 'Science', 'Health', 'Comparison', 'Research', 'Recovery', 'Anti-Aging'];

// The blogs table has no category column, so we derive a category from each
// post's title/excerpt by keyword match. Ordered by priority — the first match
// wins, defaulting to 'Education'. Keeps the tag filter working without a DB
// migration.
const CATEGORY_KEYWORDS: ReadonlyArray<{ category: string; patterns: readonly string[] }> = [
  { category: 'Comparison', patterns: ['vs', 'versus', 'compare', 'comparison', 'compared'] },
  { category: 'Anti-Aging', patterns: ['anti-aging', 'anti aging', 'antiaging', 'aging', 'longevity', 'nad'] },
  { category: 'Recovery', patterns: ['recovery', 'recover', 'healing', 'injury', 'repair', 'sleep'] },
  { category: 'Research', patterns: ['research', 'trial', 'study', 'studies', 'investigational', 'evidence'] },
  { category: 'Science', patterns: ['science', 'mechanism', 'how it works', 'how tirzepatide', 'agonist', 'receptor', 'pharmacology', 'biology'] },
  { category: 'Health', patterns: ['side effect', 'safety', 'health', 'managing', 'manage', 'risk', 'dose', 'dosing', 'symptom', 'wellness', 'nutrition', 'diet'] },
  { category: 'Education', patterns: ['guide', 'understanding', 'understand', 'basics', 'introduction', 'intro', 'explained', '101', 'what is', 'beginner'] },
];

function deriveCategory(blog: { title: string; excerpt: string }): string {
  const haystack = `${blog.title} ${blog.excerpt}`.toLowerCase();
  for (const { category, patterns } of CATEGORY_KEYWORDS) {
    if (patterns.some((p) => haystack.includes(p))) return category;
  }
  return 'Education';
}

export default function LearnPage() {
  useMembershipGate();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPeptideDetail, setShowPeptideDetail] = useState<string | null>(null);
  const [showAllPeptides, setShowAllPeptides] = useState(false);
  const [latestBlogs, setLatestBlogs] = useState<BlogArticle[]>([]);
  const [blogsLoading, setBlogsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadBlogs = async () => {
      try {
        const res = await fetch('/api/blogs?limit=6');
        const json = (await res.json()) as BlogsResponse;
        if (!cancelled && json.success) {
          setLatestBlogs(json.data?.blogs ?? []);
        }
      } catch {
        if (!cancelled) setLatestBlogs([]);
      } finally {
        if (!cancelled) setBlogsLoading(false);
      }
    };
    loadBlogs();
    return () => {
      cancelled = true;
    };
  }, []);

  const query = searchQuery.trim().toLowerCase();

  // Live blogs, tagged with a derived category and filtered by the active tag
  // + search box.
  const visibleBlogs = useMemo(() => {
    return latestBlogs
      .map((blog) => ({ ...blog, category: deriveCategory(blog) }))
      .filter((blog) => selectedCategory === 'All' || blog.category === selectedCategory)
      .filter(
        (blog) =>
          !query ||
          blog.title.toLowerCase().includes(query) ||
          blog.excerpt.toLowerCase().includes(query)
      );
  }, [latestBlogs, selectedCategory, query]);

  // Hardcoded fallback articles (shown only when the API returns no blogs),
  // filtered by the same tag + search.
  const filteredArticles = useMemo(() => {
    return articles
      .filter((a) => selectedCategory === 'All' || a.category === selectedCategory)
      .filter((a) => !query || a.title.toLowerCase().includes(query));
  }, [selectedCategory, query]);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              <BrandLogo size={40} />
              <div>
                <h1 className="text-lg font-bold text-[#2D352C]">Learn</h1>
                <p className="text-xs text-[var(--accent-strong)]">Peptide Education</p>
              </div>
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="px-4 py-4 space-y-4">
        {/* Top educational-only banner — compliance requirement */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-bold text-amber-800">
            Information provided is educational only. Always follow your prescriber&apos;s instructions.
          </p>
          <p className="text-xs text-amber-700 mt-1">
            This app does not provide compounding, reconstitution, or mixing guidance. Consult a licensed healthcare provider before using any peptide or medication.
          </p>
        </div>

        {/* Featured Banner */}
        <div className="bg-gradient-to-r from-[#9AB896] via-[#A8C5A6] to-[#B5D1B5] rounded-2xl p-5 shadow-xl">
          <span className="text-xs bg-white/30 px-2 py-1 rounded-full text-[#2D352C] font-bold">Featured</span>
          <h2 className="text-xl font-bold text-[#2D352C] mt-2">Learn About GLP-1 Peptides</h2>
          <p className="text-sm text-[#4A5A4C]">Background on mechanism, FDA status, and general dose ranges — educational only.</p>
          <div className="mt-3 pt-3 border-t border-white/30">
            <p className="text-xs text-[#4A5A4C] font-medium">Disclaimer: Information is for educational purposes only. Always consult a licensed healthcare provider before using peptides or medications.</p>
          </div>
        </div>

        {/* Peptide Encyclopedia */}
        <section
          aria-labelledby="peptide-encyclopedia-heading"
          className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden"
        >
          <div className="p-4 border-b border-[#E5EAE3] bg-gradient-to-r from-[var(--accent)]/10 to-transparent">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-2xl">🔬</span>
              <div>
                <h2 id="peptide-encyclopedia-heading" className="font-bold text-[#2D352C]">Peptide Encyclopedia</h2>
                <p className="text-xs text-[var(--text-muted)]">Educational reference</p>
              </div>
            </div>
          </div>
          <ul className="divide-y divide-[#E5EAE3] list-none p-0 m-0">
            {visiblePeptides.slice(0, showAllPeptides ? visiblePeptides.length : 6).map((peptide) => {
              const isOpen = showPeptideDetail === peptide.id;
              const detailId = `peptide-detail-${peptide.id}`;
              return (
                <li key={peptide.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={detailId}
                    onClick={() => setShowPeptideDetail(isOpen ? null : peptide.id)}
                    className="w-full text-left p-4 hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-inset"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-bold text-[#2D352C]">{peptide.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${peptide.status === 'Available' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{peptide.status}</span>
                          {peptide.investigational && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">Investigational</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">{peptide.category}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1"><span className="font-medium">Other names:</span> {peptide.otherNames.join(', ')}</p>
                      </div>
                      <span
                        aria-hidden="true"
                        className={`text-[var(--accent-strong)] text-xl transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      >
                        &#9660;
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div id={detailId} className="px-4 pb-4 space-y-4">
                      <div className="pt-4 border-t border-[#E5EAE3] space-y-4">
                        <div>
                          <p className="text-xs font-bold text-[var(--accent-strong)] uppercase">Overview</p>
                          <p className="text-sm text-[var(--text-muted)]">{peptide.overview}</p>
                        </div>
                        <div><p className="text-xs font-bold text-[var(--accent-strong)] uppercase">Mechanism</p><p className="text-sm text-[var(--text-muted)]">{peptide.mechanism}</p></div>
                        <div><p className="text-xs font-bold text-[var(--accent-strong)] uppercase">Efficacy</p><p className="text-sm text-[var(--text-muted)]">{peptide.efficacy}</p></div>
                        <div>
                          <p className="text-xs font-bold text-[var(--accent-strong)] uppercase">Education</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {peptide.education.map((item) => (
                              <li key={item} className="text-sm text-[var(--text-muted)]">{item}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="bg-[#FAF9F6] rounded-xl p-3">
                          <p className="text-xs font-bold text-[var(--accent-strong)] uppercase mb-1">Dosing</p>
                          <p className="text-sm text-[#2D352C]">{peptide.doseRange}</p>
                          <p className="text-xs text-red-700 font-bold mt-2">
                            Not a dosing protocol. This is not medical advice. You must consult a licensed healthcare provider; dosing must be supervised by a medical professional.
                          </p>
                          {peptide.fdaLabelUrl && (
                            // No target="_blank": in the iOS/Android WebView a
                            // new-window request dead-taps. A same-tab external
                            // navigation is intercepted by the native shell's
                            // onShouldStartLoadWithRequest and opened in the
                            // system browser instead, leaving the app in place.
                            <a
                              href={peptide.fdaLabelUrl}
                              rel="noopener noreferrer"
                              className="inline-flex items-center min-h-11 mt-2 text-xs font-bold text-[var(--accent-strong)] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded"
                            >
                              See FDA prescribing information for {peptide.name} &#8599;
                            </a>
                          )}
                        </div>

                        <div><p className="text-xs font-bold text-[var(--accent-strong)] uppercase">FDA Status</p><p className="text-sm text-[var(--text-muted)]">{peptide.approval}</p></div>

                        <Link
                          href="/telehealth"
                          className="block text-center min-h-11 py-2 bg-[var(--accent-strong)] text-white rounded-xl text-sm font-bold mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                        >
                          Consult About This Peptide &rarr;
                        </Link>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setShowAllPeptides(!showAllPeptides)}
            aria-expanded={showAllPeptides}
            className="w-full min-h-11 py-3 text-center text-[var(--accent-strong)] font-bold border-t border-[#E5EAE3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-inset"
          >
            {showAllPeptides ? 'Show Less' : `View All ${visiblePeptides.length} Peptides →`}
          </button>
        </section>

        {/* Search */}
        <div className="relative">
          <label htmlFor="article-search" className="sr-only">Search articles</label>
          <input
            id="article-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles..."
            className="w-full min-h-11 pl-11 pr-4 py-2.5 rounded-xl bg-white border border-[#E5EAE3] shadow-md text-sm text-[#2D352C] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
          />
          <svg
            aria-hidden="true"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" />
          </svg>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filter articles by category">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              aria-pressed={selectedCategory === category}
              className={`min-h-11 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 ${selectedCategory === category ? 'bg-[var(--accent-strong)] text-white' : 'bg-white text-[var(--text-muted)] border border-[#E5EAE3] shadow-md'}`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Articles */}
        <section aria-labelledby="latest-articles-heading" className="space-y-3">
          <h2 id="latest-articles-heading" className="font-bold text-[#2D352C] px-2">Latest Articles</h2>
          {blogsLoading ? (
            <ul className="space-y-3 list-none p-0 m-0">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-24 rounded-2xl bg-white border border-[#E5EAE3] shadow-xl animate-pulse" />
              ))}
            </ul>
          ) : latestBlogs.length > 0 ? (
            visibleBlogs.length > 0 ? (
            <ul className="space-y-3 list-none p-0 m-0">
              {visibleBlogs.map((article) => (
                <li key={article.id}>
                  <Link
                    href={`/blog/${article.slug}`}
                    className="block bg-white rounded-2xl border border-[#E5EAE3] shadow-xl p-4 hover:border-[var(--accent-strong)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                  >
                    <div className="flex items-start gap-4">
                      <div aria-hidden="true" className="w-16 h-16 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-3xl flex-shrink-0">
                        📚
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#EEF1ED] text-[var(--accent-strong)]">{article.category}</span>
                          <span className="text-xs text-[var(--text-muted)]">
                            {new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <h3 className="font-bold text-[#2D352C]">{article.title}</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{article.excerpt}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            ) : (
              <p className="text-sm text-[var(--text-muted)] px-2 py-6 text-center">
                No articles match {searchQuery ? `"${searchQuery}"` : 'this filter'}.
              </p>
            )
          ) : filteredArticles.length > 0 ? (
            <ul className="space-y-3 list-none p-0 m-0">
              {filteredArticles.map((article) => (
                <li
                  key={article.id}
                  className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl p-4 hover:border-[var(--accent-strong)] transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div aria-hidden="true" className="w-16 h-16 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-3xl flex-shrink-0">
                      {article.image}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#EEF1ED] text-[var(--accent-strong)]">{article.category}</span>
                        {article.popular && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-strong)] text-white">Popular</span>}
                        <span className="text-xs text-[var(--text-muted)]">{article.readTime} read</span>
                      </div>
                      <h3 className="font-bold text-[#2D352C]">{article.title}</h3>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-muted)] px-2 py-6 text-center">
              No articles match {searchQuery ? `"${searchQuery}"` : 'this filter'}.
            </p>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
