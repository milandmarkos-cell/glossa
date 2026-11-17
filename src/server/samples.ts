/**
 * Bundled sample texts. All are original, written for Glossa, and dedicated to the public domain (CC0).
 * They deliberately repeat words and inflected forms so highlighting and (later) lemma matching can be seen.
 */
export interface SampleText {
  language: string;
  title: string;
  level: string;
  topics: string[];
  body: string;
}

export const SAMPLE_LICENSE = 'CC0 1.0 — original text written for Glossa';

export const SAMPLES: SampleText[] = [
  {
    language: 'es',
    title: 'El mercado del sábado',
    level: 'A2',
    topics: ['culture', 'cooking'],
    body: `Todos los sábados, Lucía va al mercado de su barrio. Sale de casa temprano, cuando las calles todavía están tranquilas y el aire huele a pan recién hecho.

El mercado es pequeño, pero tiene de todo: frutas, verduras, queso, pescado y flores. Lucía conoce a muchos vendedores. Don Ramón vende naranjas y siempre le regala una. «Prueba esta naranja», le dice, «es la más dulce de la semana». Lucía la prueba y sonríe, porque Don Ramón dice lo mismo cada sábado.

Después compra tomates, cebollas y un poco de queso. Le gusta hablar con la señora del queso, que vive en el campo y viene a la ciudad solo los fines de semana. Hablan del tiempo, de los precios y de los nietos de la señora.

A las once, el mercado está lleno de gente. Hay niños que corren, perros que esperan a sus dueños y turistas que hacen fotos de todo. Lucía prefiere llegar temprano porque no le gustan las colas.

Cuando vuelve a casa, prepara una ensalada con los tomates y la cebolla. Come en el balcón, al sol, y piensa que el sábado es el mejor día de la semana. El mercado no es solo un lugar para comprar: es un lugar para encontrar a la gente del barrio.`,
  },
  {
    language: 'sr',
    title: 'Нова столица',
    level: 'A2',
    topics: ['culture'],
    body: `Марко је прошле недеље купио нову столицу. Стара столица је била сломљена, а Марко ради од куће и много седи.

Нова столица је удобна и има точкове. Марко је ставио столицу поред прозора, јер воли да гледа улицу док ради. На столици проводи осам сати сваког дана.

Његова мачка Мица такође воли нову столицу. Када Марко устане да скува кафу, Мица брзо скочи на столицу и заспи. Марко онда мора да чека или да ради стојећи.

Једног јутра Марко је купио још једну столицу, само за мачку. Ставио ју је поред своје столице. Али Мица и даље спава на Марковој столици. Мачке увек бирају оно што није њихово.

Сада у соби стоје две столице, а Марко поново ради стојећи. Каже да је то добро за леђа.`,
  },
  {
    language: 'ja',
    title: '日曜日の公園',
    level: 'A2',
    topics: ['nature'],
    body: `日曜日の朝、ゆいさんは犬のポチと公園へ散歩に行きます。公園は家から歩いて十分ぐらいです。

公園には大きな池があります。池の近くにはベンチがたくさんあって、おじいさんやおばあさんが座って話しています。子どもたちはボールで遊んでいます。

ポチは池の鳥が大好きです。鳥を見ると、いつも走りたがります。でも、ゆいさんはリードをしっかり持っています。

散歩のあと、ゆいさんは公園の中のカフェでコーヒーを飲みます。カフェの店員さんはポチのことを知っていて、いつも水をくれます。

ゆいさんは日曜日の公園が好きです。静かで、緑がたくさんあって、ゆっくり時間が流れます。来週の日曜日も、またポチと公園へ行きます。`,
  },
  {
    language: 'ar',
    title: 'يوم في المكتبة',
    level: 'A2',
    topics: ['culture'],
    body: `تذهب سارة إلى المكتبة كل يوم سبت. المكتبة قريبة من بيتها، وهي هادئة وجميلة.

في المكتبة كتب كثيرة. تحب سارة كتب التاريخ وكتب السفر. تجلس قرب النافذة وتقرأ لمدة ساعتين.

أمينة المكتبة تعرف سارة جيدًا. كل أسبوع تقول لها: «عندنا كتاب جديد عن السفر!» وسارة تبتسم وتأخذ الكتاب.

بعد القراءة، تشرب سارة الشاي في المقهى الصغير بجانب المكتبة. ثم ترجع إلى البيت مع كتاب جديد.`,
  },
];
