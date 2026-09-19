import type { GameMode } from "./types";

export interface BookPage {
  id: string;
  title: string;
  icon: string;
  what: string;
  reality: string;
  inGame: string;
  example: string;
  /** When set, a shortcut button closes the book and switches to this mode. */
  practiceMode?: GameMode;
}

export interface BookCategory {
  id: string;
  title: string;
  icon: string;
  pages: BookPage[];
}

export const BOOK_CATEGORIES: BookCategory[] = [
  {
    id: "basics",
    title: "ネットワーク基礎",
    icon: "📘",
    pages: [
      {
        id: "network",
        title: "ネットワークとは",
        icon: "🌐",
        what: "複数のコンピューターや機器が、データをやり取りできるようにつながった仕組みのこと。",
        reality: "会社のPCやプリンター、スマホなどが、ケーブルやWi-Fiでお互いに情報をやり取りしている。",
        inGame: "このゲームでは、PC・スイッチ・ルーターなどを配線し、設定することでネットワークを作る。",
        example: "PC ── Switch ── Router ── Internet",
      },
      {
        id: "lan",
        title: "LANとは",
        icon: "🏢",
        what: "Local Area Networkの略。会社やオフィスなど、限られた範囲内のネットワークのこと。",
        reality: "1つのオフィス内のPC・プリンター・サーバーなどをつなぐ社内ネットワークがLAN。",
        inGame: "ルーターより内側（LANポート側）に接続された機器同士のネットワークがLAN。",
        example: "Router\n  └ Switch\n     ├ PC\n     └ PC",
      },
      {
        id: "wan",
        title: "WANとは",
        icon: "🛰️",
        what: "Wide Area Networkの略。LANの外側、インターネットを含む広い範囲のネットワークのこと。",
        reality: "本社と支店をつなぐ回線や、インターネットそのものがWANにあたる。",
        inGame: "ルーターのWANポートから先（ONU・インターネット側）がWAN。",
        example: "Router [WANポート] ── ONU ── Internet",
      },
      {
        id: "internet",
        title: "インターネットとは",
        icon: "☁️",
        what: "世界中のネットワークが相互につながった、最も大きなネットワークのこと。",
        reality: "ISP（インターネットサービスプロバイダ）の回線を通じて世界中とつながる。",
        inGame: "画面上の☁️ INTERNETは、ISPの回線の出口を表す固定の機器として扱う。",
        example: "Internet ── ONU ── Router",
      },
    ],
  },
  {
    id: "devices",
    title: "機器",
    icon: "🖥️",
    pages: [
      {
        id: "onu",
        title: "ONU（回線終端装置）",
        icon: "📶",
        what: "ISPの光回線などを、ルーターがつなげられる信号に変換する機器。",
        reality: "光回線を家やオフィスに引き込んだ末端に設置され、ルーターのWANポートにつなぐ。",
        inGame: "☁️ INTERNETとルーターの間に必ず設置する。ONUなしではインターネットに出られない。",
        example: "Internet ── ONU ── Router[WAN]",
        practiceMode: "connecting",
      },
      {
        id: "router",
        title: "ルーター",
        icon: "🌐",
        what: "LANとWANをつなぎ、複数の機器でインターネット回線を共有できるようにする機器。",
        reality: "DHCPで社内のPCにIPアドレスを自動的に配り、NATでインターネットへの出入り口になる。",
        inGame: "⚙設定でLAN側のIPアドレス・DHCPの範囲・NATのON/OFFを設定できる。",
        example: "Internet ── ONU ── Router ── Switch ── PC",
        practiceMode: "settings",
      },
      {
        id: "switch",
        title: "スイッチ",
        icon: "🔀",
        what: "複数のネットワーク機器を接続し、LANの中でデータを中継する装置。",
        reality: "PCやプリンターなどをまとめて接続し、ポート数を超えて増やしたいときに追加する。",
        inGame: "PCが増えてルーターのポートだけでは足りなくなった場合などに使用する。ポート数には上限がある。",
        example: "Router\n  └ Switch\n     ├ PC\n     ├ PC\n     └ PC",
        practiceMode: "connecting",
      },
      {
        id: "wifi",
        title: "Wi-Fiアクセスポイント",
        icon: "📡",
        what: "有線LANの電波を無線化し、PCやスマホをケーブルなしでつなげるようにする機器。",
        reality: "会議室やフリーアドレス席など、配線しにくい場所への接続手段として使われる。",
        inGame: "スイッチやルーターに有線で接続し、無線ポートに複数台の機器を同時接続できる。",
        example: "Switch ── AP ))) PC / スマホ",
      },
      {
        id: "server",
        title: "サーバー",
        icon: "🖥️",
        what: "社内のPCなどに何らかのサービス（データ共有など）を提供するコンピューター。",
        reality: "ファイルサーバー・メールサーバーなど、常時稼働しアクセスされることが多い。",
        inGame: "固定IPで設置することが多い。他のPCと同じ手順で配線・設定する。",
        example: "Switch ── Server（固定IP）",
        practiceMode: "settings",
      },
      {
        id: "pc",
        title: "PC",
        icon: "💻",
        what: "社員が実際に使う端末。",
        reality: "有線LANまたはWi-Fiでネットワークに接続し、IPアドレスを持つ。",
        inGame: "DHCPで自動取得するか、手動でIPアドレスを設定する。",
        example: "PC → Switch → Router → Internet",
      },
    ],
  },
  {
    id: "wiring",
    title: "配線",
    icon: "🔌",
    pages: [
      {
        id: "cable",
        title: "LANケーブル",
        icon: "🔌",
        what: "機器同士を物理的につなぎ、電気信号でデータをやり取りするケーブル。",
        reality: "規格（Cat6など）ごとに対応速度や最大長が決まっており、1本あたり最大100m程度が目安。",
        inGame: "配置した機器の座標から実際の距離を計算し、100mを超えると配線できても通信できない扱いになる。",
        example: "PC ──(23.4m)── LAN Jack",
        practiceMode: "connecting",
      },
      {
        id: "lan_jack",
        title: "LANコンセント（LANジャック）",
        icon: "🔌",
        what: "壁に設置する情報コンセント。PCから来たケーブルの終端になる。",
        reality: "壁の中の配線を通じて、離れた通信室のパッチパネルまでつながっている。",
        inGame: "PC側とパッチパネル側、2つのポートを持つ。両方をケーブルでつなぐ必要がある。",
        example: "PC ── LAN Jack ── (壁内配線) ── Patch Panel",
        practiceMode: "connecting",
      },
      {
        id: "patch_panel",
        title: "パッチパネル",
        icon: "🗄️",
        what: "通信室でLANコンセントからの配線をまとめ、スイッチへ引き渡す機器。",
        reality: "どのLANジャックがどのスイッチポートにつながっているか、パッチパネルで管理する。",
        inGame: "PCが増えてルーターのポートだけでは足りなくなった場合などに、スイッチと同じように使う。",
        example: "Router\n   └ Switch\n      └ Patch Panel\n         └ LAN Jack ── PC",
        practiceMode: "connecting",
      },
      {
        id: "rack",
        title: "通信ラック",
        icon: "🗃️",
        what: "通信室に設置し、ONU・ルーター・スイッチ・パッチパネルなどをまとめて収める什器。",
        reality: "機器を棚板やネジで固定し、配線を整理しやすくする。高さは「U」という単位で管理される。",
        inGame: "通信室に置く装飾的な設備で、ケーブルはつなげない。ラックの近くに機器をまとめて配置しよう。",
        example: "通信室\n ├ 🗃️ Rack\n ├ 📶 ONU\n ├ 🌐 Router\n ├ 🔀 Switch\n └ 🗄️ Patch Panel",
      },
    ],
  },
  {
    id: "settings",
    title: "ネットワーク設定",
    icon: "⚙️",
    pages: [
      {
        id: "ip",
        title: "IPアドレス",
        icon: "🔢",
        what: "ネットワーク上の機器を識別するための番号（例：192.168.1.10）。",
        reality: "同じネットワーク内で重複してはいけない。重複すると通信できなくなる。",
        inGame: "DHCPで自動取得するか、⚙設定画面で手動設定できる。重複すると診断で検出される。",
        example: "PC-01: 192.168.1.10\nPC-02: 192.168.1.11",
        practiceMode: "settings",
      },
      {
        id: "subnet",
        title: "サブネットマスク",
        icon: "🧮",
        what: "IPアドレスのうち、どこまでが「ネットワークの範囲」かを表す値（例：255.255.255.0）。",
        reality: "同じサブネットマスクの範囲内にある機器同士は、ルーターを介さず直接通信できる。",
        inGame: "IPアドレスとセットで設定する。ゲートウェイと違うサブネットだと通信できない。",
        example: "IP: 192.168.1.10\nMask: 255.255.255.0",
        practiceMode: "settings",
      },
      {
        id: "dhcp",
        title: "DHCP",
        icon: "🤖",
        what: "PCなどにIPアドレスを自動的に割り当てる仕組み。",
        reality: "ルーターがDHCPサーバーとなり、あらかじめ決めた範囲からIPアドレスを配る。",
        inGame: "ルーターの⚙設定でON/OFF・配布範囲を設定できる。PC側は「自動取得」を選ぶと使える。",
        example: "DHCP範囲：192.168.1.100～200",
        practiceMode: "settings",
      },
      {
        id: "gateway",
        title: "デフォルトゲートウェイ",
        icon: "🚪",
        what: "自分のネットワークの外（インターネットなど）へ出るときの出口となる機器のIPアドレス。",
        reality: "通常はルーターのLAN側IPアドレスを指定する。",
        inGame: "設定が空、または間違っていると、社内通信はできてもインターネットに出られなくなる。",
        example: "PC Gateway = Router LAN IP (192.168.1.1)",
        practiceMode: "settings",
      },
      {
        id: "dns",
        title: "DNS",
        icon: "📇",
        what: "ドメイン名（www.example.comなど）をIPアドレスに変換する仕組み。",
        reality: "DNSが正しく設定されていないと、IPアドレスへの通信はできてもサイト名でのアクセスができない。",
        inGame: "PCの⚙設定でDNSサーバーのIPアドレスを設定する（多くの場合ルーターのIP）。",
        example: "DNS: 192.168.1.1",
        practiceMode: "settings",
      },
      {
        id: "nat",
        title: "NAT",
        icon: "🔁",
        what: "社内で使うプライベートIPアドレスを、インターネット用のIPアドレスに変換する仕組み。",
        reality: "複数のPCが1つの回線を共有してインターネットに出られるのはNATのおかげ。",
        inGame: "ルーターの⚙設定でON/OFFできる。OFFにするとインターネットに出られなくなる。",
        example: "192.168.1.10 → NAT → Internet",
        practiceMode: "settings",
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "トラブル対応",
    icon: "🛠️",
    pages: [
      {
        id: "check_cable",
        title: "ケーブルを確認する",
        icon: "🔌",
        what: "物理的にケーブルが抜けていないか、正しい機器につながっているかを確認する作業。",
        reality: "現場では「リンクランプ（ポートのランプ）」が点灯しているかでまず確認する。",
        inGame: "🔍調査モードで機器をタップすると、各ポートの接続先とケーブル情報を確認できる。",
        example: "PC-03のポート → 接続なし（ケーブル抜け）",
        practiceMode: "diagnosing",
      },
      {
        id: "ping",
        title: "Pingで確認する",
        icon: "📶",
        what: "相手先に信号を送り、応答が返ってくるかどうかで通信できているか調べるコマンド。",
        reality: "ping 192.168.1.1 のように打つと、応答時間や成功／失敗が表示される。",
        inGame: "🔍調査でPC・サーバーを選ぶと、Pingツールで任意のIPアドレスに送れる。",
        example: "ping 192.168.1.1 → Reply: Success",
        practiceMode: "diagnosing",
      },
      {
        id: "check_ip",
        title: "IP設定を確認する",
        icon: "🔢",
        what: "PCに正しいIPアドレス・サブネット・ゲートウェイが設定されているか確認する作業。",
        reality: "Windowsならipconfig、Macならifconfigで確認できる。",
        inGame: "⚙設定でPCを選ぶと現在の設定を確認・編集できる。DHCPなら自動取得の結果も診断で見られる。",
        example: "IP: 192.168.1.10 / Mask: 255.255.255.0",
        practiceMode: "settings",
      },
      {
        id: "check_dhcp",
        title: "DHCPを確認する",
        icon: "🤖",
        what: "IPアドレスが自動取得できているか、DHCPサーバー（ルーター）が正しく動いているか確認する作業。",
        reality: "IPアドレスが取得できない場合、ケーブルが繋がっていないかDHCPサーバーが見つからないことが多い。",
        inGame: "🔍調査の診断結果で「IPアドレスを取得できません」と出たら、物理接続とルーターのDHCP設定を確認する。",
        example: "IPアドレス：❌ DHCPサーバーが見つかりません",
        practiceMode: "diagnosing",
      },
      {
        id: "check_dns",
        title: "DNSを確認する",
        icon: "📇",
        what: "DNSサーバーの設定が正しいか確認する作業。",
        reality: "IPアドレスへの通信は成功するのに、サイト名でアクセスできない場合はDNSが疑わしい。",
        inGame: "診断結果でDNSより手前がすべて✅なのにDNSだけ❌なら、DNSサーバーのIP設定を見直す。",
        example: "Gateway: ✅ / DNS: ❌",
        practiceMode: "diagnosing",
      },
      {
        id: "check_port",
        title: "ポート障害を確認する",
        icon: "🔌",
        what: "スイッチやルーターの特定のポートが故障し、そのポートにつながる機器だけ通信できなくなる障害。",
        reality: "ポートのランプが消えている、他のポートに挿し直すと直る、などで見分ける。",
        inGame: "⚙設定で機器を選ぶと各ポートのON/OFFを切り替えられる。OFFにしたポートを使う経路は「ポート状態」の診断で失敗する。",
        example: "Switch-01 Port03 ❌ → 経由するPCだけ通信失敗",
        practiceMode: "settings",
      },
    ],
  },
];

export function findBookPage(pageId: string): { category: BookCategory; page: BookPage } | null {
  for (const category of BOOK_CATEGORIES) {
    const page = category.pages.find((p) => p.id === pageId);
    if (page) return { category, page };
  }
  return null;
}
