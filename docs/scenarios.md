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

Always use the [**map generator**](http://homm3bgmapeditor.zedero.nl/) to create your maps.

The official version uses low-quality assets however. To ensure consistency and nicer look, you have to inject curated map tiles to the tool.

Here's how you do it:

1. Download [**high-quality tiles**](https://drive.google.com/file/d/1d2iTxc_dUNzT3h-jSftbV1v-BxiYshtl/view?usp=drive_link) and unzip them to a new directory so that you have the following structure

    ```
    top level directory
    └── homm3bgmapeditor.zedero.nl
        └── assets ...
    ```

2. Open Google Chrome, Dev Tools and load those tiles from `top level directory`. The video tutorial below will guide you through the necessary steps. *Don't worry, it's a one-time setup. Next time you want to use those assets again, just open Dev Tools and high-quality map tiles should be loaded automatically.*

    <iframe 
        width="100%" 
        height="400" 
        src="https://www.youtube.com/embed/YymgXc-JMiY?si=PjG_t4RgkWjsg1si" 
        title="HOMM3 BG Map Generator (High Quality Map Tiles)" 
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" 
        allowfullscreen></iframe>

3. Refresh the **map generator** page to apply the tiles.

4. Always **export** the final map from the **map generator** and store it in a new file in `assets/map-files`.

5. Trim and resize your map to a maximum width of 2000px.

**TIP:** If the **map generator** is slow, make sure that the *Network* tab in *Dev Tools* has *Disable caches* unchecked.
