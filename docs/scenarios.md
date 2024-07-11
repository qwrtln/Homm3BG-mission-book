# How to write scenarios

To make your life easier, there is a set of predefined [**templates**](https://github.com/qwrtln/Homm3BG-mission-book/tree/main/templates) you can use as a starting point.

## Common guidelines

- Each scenario type has its own root directory where it belongs: `coops`, `clash`, `campaigns`. Apart from adding the scenario itself, you have to register it in the directory's `main.tex`.
- New scenarios have to be added to the translation framework. Simply edit `po4a.cfg` - copy a line from existing scenario and change the paths accordingly. Once this is done, run `po4a -v po4a.cfg` to generate the files.

## Solo Campaign

Your first scenario should start with the following line that adds a record to the table of contents:

```latex
\cleardoublepage\phantomsection\addcontentsline{toc}{section}{\protect\numberline{} {} {} {} {}<Campaign Name Here>}
```

The `\addscenariosection` has to set its default parameter to `subsection` to appear correctly in table of contents. Other game types (Clash, Alliance, Cooperative) don't need the extra parameter.

```latex
\addscenariosection[subsection]{1}{Campaign name}{Scenario name}{\images/title.png}
```

## Maps

1. Use the [**map generator**](http://homm3bgmapeditor.zedero.nl/) to create your maps.

2. Always **export** the final map from the **map generator** and store it in a new file in `assets/map-files`.

3. Trim and resize your map to a maximum width of 2000px.
