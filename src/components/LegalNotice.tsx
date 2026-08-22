const source = "https://catalog.data.metro.tokyo.lg.jp/dataset/t000008d2000000024";
const ccBy = "https://creativecommons.org/licenses/by/4.0/deed.ja";

export function LegalNotice() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-6 text-xs leading-5 text-slate-600 md:px-6 xl:px-8">
        <p><strong>行政オープンデータの出典：</strong>東京都都市整備局「緑のオープンデータ（GISデータ）」を加工して作成（CC BY 4.0、利用日：2026年8月22日）。 <a className="text-primary underline" href={source} target="_blank" rel="noreferrer">データセット</a></p>
        <p>本サービスによる加工であり、東京都が作成・推奨するものではありません。</p>
        <details>
          <summary className="cursor-pointer font-semibold text-slate-800">利用規約・投稿データの取り扱い</summary>
          <p className="mt-1">投稿者は著作権を保持し、運営・表示・保存・不正対策・改善に必要な範囲で運営者へ非独占的・無償の利用を許諾します。人物、第三者著作物、私有地、位置情報の公開には投稿者が必要な確認・許諾を得てください。</p>
          <p className="mt-1">市民投稿をCC BY 4.0で公開する場合は、投稿者の明示的な同意を得ます。</p>
        </details>
        <p><a className="text-primary underline" href={ccBy} target="_blank" rel="noreferrer">CC BY 4.0の内容</a><span className="mx-2">·</span>ソースコードはMIT Licenseです（行政データ・市民投稿・ロゴ等を除く）。</p>
      </div>
    </footer>
  );
}
