# Container-based Setup

Instead of installing all the dependencies directly on your system, you can use our container-based setup that works across all operating systems (see the [Dockerfile](https://github.com/qwrtln/Homm3BG-mission-book/blob/main/tools/container/Dockerfile)).
The built image weighs ~1.1 GB.
You only need [Podman](https://podman.io/getting-started/installation) (recommended) or [Docker](https://www.docker.com/get-started) container engine to be installed.

## Wrapper Script

We provide a wrapper script ([`run.sh`](https://github.com/qwrtln/Homm3BG-mission-book/blob/main/run.sh) in the repository root directory) that handles all the container operations for you.
The script automatically:

- Detects whether you have Podman or Docker
- Pulls the container image if needed
- Runs your commands in the container
- Opens the resulting PDF when applicable

## Usage Examples

You can run all the scripts in the repository using the wrapper script.

Build draft scenarios:
```bash
./run.sh tools/build.sh -d
```

Build the Czech version:
```bash
./run.sh tools/build.sh cs
```

Compare specific pages in English:
```bash
./run.sh tools/compare_pages.sh -l en -r 5-9
```

## Usage without the wrapper script

You can run the comands yourself, if you prefer.

=== "Podman"

    Pull the image first:
    ```bash
    podman pull ghcr.io/qwrtln/homm3bg:latest
    ```

    And then run it with the repository mounted as a volume:
    ```bash
    podman run --rm -v "$(pwd):/data" homm3bg:latest tools/build.sh -d
    ```

=== "Docker"

    Pull the image first:
    ```bash
    docker pull ghcr.io/qwrtln/homm3bg:latest
    ```

    And then run it with the repository mounted as a volume:
    ```bash
    docker run --rm -v "$(pwd):/data" --user "$(id -u):$(id -g)" homm3bg:latest tools/build.sh -d
    ```

Bear in mind that this approach will not open PDF files automatically for you.
