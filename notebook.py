"""Mello product-usage analysis for the January 2023 drop Casey flagged.

Run from the repo root:

    python3 notebook.py

Reads data/usage_data.csv (minutes). Writes charts under charts/ and prints
the figures behind the email in email.md.
"""

import os

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd

DATA_PATH = os.path.join("data", "usage_data.csv")
CHART_DIR = "charts"

# Roadmap minutes are rescaled in two steps. Both factors put every later
# user-day back inside the 40-60 minute band the feature held for five years.
PHASE1_END = pd.Timestamp("2022-07-31")
PHASE2_START = pd.Timestamp("2022-08-01")
BREAK_START = pd.Timestamp("2022-06-01")

FEATURE_COLORS = {
    "Roadmap": "#D35400",
    "Reporting": "#1F4E79",
    "Saga Creation": "#148F77",
    "Task Creation": "#5D6D7E",
    "Account Managment": "#7D3C98",
    "Automation": "#B7950B",
}


def load_usage(path=DATA_PATH):
    df = pd.read_csv(path)
    df["Date"] = pd.to_datetime(df["Date"], dayfirst=True)
    df["Sessions"] = pd.to_numeric(df["Sessions"])
    df["Time spent"] = pd.to_numeric(df["Time spent"])
    df["Average time spent"] = pd.to_numeric(df["Average time spent"])
    df["month"] = df["Date"].dt.to_period("M")
    df["restored_minutes"] = df.apply(restore_minutes, axis=1)
    return df


def restore_minutes(row):
    """Undo the Roadmap-only rescaling so hours are comparable to 2017-May 2022."""
    if row["Feature"] != "Roadmap" or row["Date"] < BREAK_START:
        return row["Time spent"]
    if row["Date"] <= PHASE1_END:
        return row["Time spent"] * 1.5
    return row["Time spent"] * 2.0


def monthly_hours(df, value_col):
    return df.groupby("month")[value_col].sum() / 60.0


def feature_monthly_hours(df, value_col="Time spent"):
    table = df.pivot_table(
        index="month", columns="Feature", values=value_col, aggfunc="sum"
    ).fillna(0.0)
    return table / 60.0


def print_analysis(df):
    reported = monthly_hours(df, "Time spent")
    restored = monthly_hours(df, "restored_minutes")
    pre = reported[reported.index < "2022-06"]
    post = reported[reported.index >= "2022-06"]
    jan = reported[reported.index.month == 1]
    prior_jans = jan[jan.index.year < 2023]

    print("=" * 72)
    print("MELLO USAGE — JANUARY 2023 DROP")
    print("=" * 72)
    print(
        "Rows: {:,}   Users: {}   Features: {}   {} to {}".format(
            len(df),
            df["Username"].nunique(),
            df["Feature"].nunique(),
            df["Date"].min().date(),
            df["Date"].max().date(),
        )
    )
    print("Features:", ", ".join(sorted(df["Feature"].unique())))
    print()
    print("January 2023 reported hours: {:.2f}  ({:,.0f} minutes)".format(
        reported.loc["2023-01"], reported.loc["2023-01"] * 60
    ))
    print("Prior January average (2018-2022): {:.2f} hours".format(prior_jans.mean()))
    print("January 2023 vs prior Januaries: {:+.1f}%".format(
        100.0 * (reported.loc["2023-01"] / prior_jans.mean() - 1)
    ))
    print("Months actually under 50 hours:")
    under = reported[reported < 50]
    if under.empty:
        print("  none")
    else:
        for period, hours in under.items():
            print("  {}  {:.2f}h".format(period, hours))
    print()
    print("Mean monthly hours before June 2022: {:.2f}".format(pre.mean()))
    print("Mean monthly hours from June 2022 on (reported): {:.2f}".format(post.mean()))
    print("Mean monthly hours from June 2022 on (Roadmap restored): {:.2f}".format(
        restored[restored.index >= "2022-06"].mean()
    ))
    print("January 2023 restored hours: {:.2f}".format(restored.loc["2023-01"]))
    print()

    feat = feature_monthly_hours(df)
    print("Mean monthly hours by feature, before June 2022 vs after:")
    print("{:22} {:>10} {:>10} {:>10}".format("Feature", "Before", "After", "Change"))
    for feature in feat.mean().sort_values(ascending=False).index:
        before = feat.loc[feat.index < "2022-06", feature].mean()
        after = feat.loc[feat.index >= "2022-06", feature].mean()
        print("{:22} {:10.2f} {:10.2f} {:10.2f}".format(
            feature, before, after, after - before
        ))

    roadmap = df[df["Feature"] == "Roadmap"]
    phase1 = roadmap[(roadmap["Date"] >= BREAK_START) & (roadmap["Date"] <= PHASE1_END)]
    phase2 = roadmap[roadmap["Date"] >= PHASE2_START]
    before = roadmap[roadmap["Date"] < BREAK_START]
    p1 = phase1["Time spent"] * 1.5
    p2 = phase2["Time spent"] * 2.0
    print()
    print("Roadmap user-day minutes:")
    print("  before June 2022     n={:4d}  min {:.0f}  max {:.0f}  mean {:.2f}".format(
        len(before), before["Time spent"].min(), before["Time spent"].max(), before["Time spent"].mean()
    ))
    print("  Jun-Jul 2022 x 1.5   n={:4d}  min {:.0f}  max {:.0f}  mean {:.2f}  all in 40-60: {}".format(
        len(phase1), p1.min(), p1.max(), p1.mean(), bool(((p1 >= 40) & (p1 <= 60)).all())
    ))
    print("  Aug 2022-Jan 2023 x2 n={:4d}  min {:.0f}  max {:.0f}  mean {:.2f}  all in 40-60: {}".format(
        len(phase2), p2.min(), p2.max(), p2.mean(), bool(((p2 >= 40) & (p2 <= 60)).all())
    ))

    def engagement(label, frame):
        print(
            "  {:16} users {:3d}   sessions {:5.0f}   user-days {:3d}   reported hours {:6.2f}".format(
                label,
                frame["Username"].nunique(),
                frame["Sessions"].sum(),
                len(frame),
                frame["Time spent"].sum() / 60.0,
            )
        )

    print()
    print("Roadmap engagement, January 2022 vs January 2023:")
    engagement("Jan 2022", roadmap[roadmap["month"] == "2022-01"])
    engagement("Jan 2023", roadmap[roadmap["month"] == "2023-01"])
    print("All-feature monthly active users:")
    mau = df.groupby("month")["Username"].nunique()
    print("  long-run average {:.1f}   Jan 2022 {}   Jan 2023 {}".format(
        mau.mean(), mau.loc["2022-01"], mau.loc["2023-01"]
    ))
    print()
    print("Prior January hours (reported):")
    for period, hours in jan.items():
        road = feat.loc[period, "Roadmap"]
        print("  {}  total {:6.2f}h   roadmap {:6.2f}h   other {:6.2f}h".format(
            period, hours, road, hours - road
        ))


def _style():
    plt.rcParams.update({
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": "#E5E8EB",
        "grid.linewidth": 0.8,
        "font.size": 11,
        "axes.titlesize": 13,
        "axes.titleweight": "bold",
        "axes.labelsize": 11,
        "legend.frameon": False,
    })


def _month_axis(ax):
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=6))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    ax.tick_params(axis="x", rotation=0)
    for label in ax.get_xticklabels():
        label.set_ha("right")
        label.set_rotation(30)


def save(fig, name):
    path = os.path.join(CHART_DIR, name)
    fig.savefig(path, dpi=140, bbox_inches="tight")
    plt.close(fig)
    print("wrote", path)


def chart_total(df):
    reported = monthly_hours(df, "Time spent")
    restored = monthly_hours(df, "restored_minutes")
    x = reported.index.to_timestamp()

    fig, ax = plt.subplots(figsize=(11, 5.2))
    ax.plot(x, reported.values, color="#1F4E79", lw=2.2, label="Reported hours")
    ax.plot(
        x, restored.values, color="#1E8449", lw=2.0, ls="--",
        label="Hours with Roadmap time put back on the old scale",
    )
    ax.axhline(50, color="#922B21", lw=1, ls=":", label="50 hours")
    ax.axvline(BREAK_START, color="#D35400", lw=1, ls="--", alpha=0.9)
    ax.annotate(
        "Roadmap clock changes\n1 Jun 2022",
        xy=(BREAK_START, reported.loc["2022-06"]),
        xytext=(pd.Timestamp("2020-03-01"), 46),
        fontsize=9,
        color="#D35400",
        arrowprops=dict(arrowstyle="->", color="#D35400"),
    )
    jan_x = pd.Timestamp("2023-01-01")
    jan_y = reported.loc["2023-01"]
    ax.scatter([jan_x], [jan_y], color="#922B21", zorder=5)
    ax.annotate(
        "Jan 2023\n{:.1f}h reported\n{:.1f}h restored".format(jan_y, restored.loc["2023-01"]),
        xy=(jan_x, jan_y),
        xytext=(pd.Timestamp("2021-06-01"), 72),
        fontsize=9,
        arrowprops=dict(arrowstyle="->", color="#922B21"),
    )
    ax.set_title("Total time on Mello — the drop starts in June 2022, not January")
    ax.set_ylabel("Hours per month")
    ax.set_ylim(40, 78)
    _month_axis(ax)
    ax.legend(loc="upper left")
    fig.tight_layout()
    save(fig, "monthly_total_hours.png")


def chart_by_feature(df):
    feat = feature_monthly_hours(df)
    order = [
        "Roadmap",
        "Saga Creation",
        "Reporting",
        "Task Creation",
        "Account Managment",
        "Automation",
    ]
    x = feat.index.to_timestamp()

    fig, ax = plt.subplots(figsize=(11, 5.2))
    ax.stackplot(
        x,
        [feat[name].values for name in order],
        labels=["Account Management" if name == "Account Managment" else name for name in order],
        colors=[FEATURE_COLORS[name] for name in order],
        alpha=0.92,
    )
    ax.axvline(BREAK_START, color="white", lw=1.2, ls="--")
    ax.set_title("Only Roadmap shrank — the other five features kept their hours")
    ax.set_ylabel("Hours per month")
    _month_axis(ax)
    handles, labels = ax.get_legend_handles_labels()
    ax.legend(handles[::-1], labels[::-1], loc="upper left", ncol=2, fontsize=9)
    ax.set_ylim(0, 80)
    fig.tight_layout()
    save(fig, "hours_by_feature.png")


def chart_roadmap_engagement(df):
    roadmap = df[df["Feature"] == "Roadmap"]
    hours = roadmap.groupby("month")["Time spent"].sum() / 60.0
    restored = roadmap.groupby("month")["restored_minutes"].sum() / 60.0
    sessions = roadmap.groupby("month")["Sessions"].sum()
    users = roadmap.groupby("month")["Username"].nunique()
    x = hours.index.to_timestamp()

    fig, axes = plt.subplots(2, 1, figsize=(11, 7.2), sharex=True)

    axes[0].plot(x, hours.values, color="#D35400", lw=2.2, label="Reported Roadmap hours")
    axes[0].plot(x, restored.values, color="#1E8449", lw=2.0, ls="--", label="Restored to the pre-June scale")
    axes[0].axvline(BREAK_START, color="#7F8C8D", lw=1, ls="--")
    axes[0].set_ylabel("Hours")
    axes[0].set_title("Roadmap time fell by about half. Visits did not.")
    axes[0].legend(loc="upper right")

    axes[1].plot(x, sessions.values, color="#1F4E79", lw=2.0, label="Roadmap sessions")
    ax2 = axes[1].twinx()
    ax2.plot(x, users.values, color="#7D3C98", lw=1.6, label="Distinct Roadmap users")
    ax2.spines["right"].set_visible(True)
    axes[1].axvline(BREAK_START, color="#7F8C8D", lw=1, ls="--")
    axes[1].set_ylabel("Sessions")
    ax2.set_ylabel("Users")
    axes[1].set_ylim(0, 700)
    ax2.set_ylim(0, 40)
    h1, l1 = axes[1].get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    axes[1].legend(h1 + h2, l1 + l2, loc="upper right")
    _month_axis(axes[1])
    fig.tight_layout()
    save(fig, "roadmap_time_vs_sessions.png")


def chart_duration_band(df):
    roadmap = df[df["Feature"] == "Roadmap"].sort_values("Date")
    fig, ax = plt.subplots(figsize=(11, 5.2))
    ax.axhspan(40, 60, color="#D5F5E3", alpha=0.85, label="Historical band, 40–60 min")
    ax.scatter(
        roadmap["Date"], roadmap["Time spent"],
        s=12, c="#D35400", alpha=0.45, linewidths=0, label="Reported minutes per user-day",
    )
    shifted = roadmap[roadmap["Date"] >= BREAK_START]
    ax.scatter(
        shifted["Date"], shifted["restored_minutes"],
        s=14, c="#1E8449", alpha=0.55, linewidths=0, marker="x",
        label="Same rows, scaled back (×1.5 then ×2)",
    )
    ax.axvline(BREAK_START, color="#7F8C8D", lw=1, ls="--")
    ax.axvline(PHASE2_START, color="#7F8C8D", lw=1, ls=":")
    ax.annotate("×2/3", xy=(pd.Timestamp("2022-06-20"), 33), fontsize=9, color="#D35400")
    ax.annotate("×1/2", xy=(pd.Timestamp("2022-09-01"), 22), fontsize=9, color="#D35400")
    ax.set_ylim(0, 75)
    ax.set_ylabel("Minutes on Roadmap in a user-day")
    ax.set_title("Every later Roadmap row is the old 40–60 minute band, rescaled")
    _month_axis(ax)
    ax.legend(loc="lower left", fontsize=9)
    fig.tight_layout()
    save(fig, "roadmap_duration_band.png")


def main():
    _style()
    os.makedirs(CHART_DIR, exist_ok=True)
    df = load_usage()
    # The export's average column is time divided by sessions. Nothing else is in it.
    implied = df["Time spent"] / df["Sessions"]
    gap = (implied - df["Average time spent"]).abs().max()
    print("Max gap between Time spent / Sessions and Average time spent: {:.3e}".format(gap))
    print_analysis(df)
    chart_total(df)
    chart_by_feature(df)
    chart_roadmap_engagement(df)
    chart_duration_band(df)


if __name__ == "__main__":
    main()
